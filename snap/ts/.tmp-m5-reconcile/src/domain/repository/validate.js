import { encodeBase64 } from "../content/base64.js";
import { classifyContent } from "../content/classify.js";
import { joinTextTokens } from "../content/tokenize.js";
import { applyEdit } from "../edit/apply.js";
import { constructEdit } from "../edit/construct.js";
import { domainError } from "../errors.js";
import { materializeVersion } from "../history/materialize.js";
import { schedulePatches } from "../history/ready-scheduler.js";
import { err, ok } from "../result.js";
import { bytesEqual } from "../tree/change.js";
import { constructFileTree } from "../tree/construct.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { formatVersion } from "../version/format.js";
import { EMPTY_VERSION } from "../version/types.js";
import { dotKey } from "./index.js";
const textEncoder = new TextEncoder();
/**
 * Creates the validation pipeline's private replay capability. This is kept
 * here, rather than exported from `types.ts`, so callers cannot bless an
 * arbitrary `RepositoryDocument` as fully validated.
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable domain value.
function validationCandidate(document) {
    return Object.freeze({ document });
}
function baseRevision(base, author) {
    return base.components.find((component) => component.contributorId === author)?.revision ?? 0;
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RawPatch contains decoded byte arrays treated immutably.
function validateStorage(patches) {
    const lastByAuthor = new Map();
    let previous;
    for (const patch of patches) {
        if (previous !== undefined) {
            const authorOrder = compareUnsignedUtf8(previous.author, patch.author);
            if (authorOrder > 0 || (authorOrder === 0 && previous.revision >= patch.revision)) {
                return err(domainError("validation", "repository patches must be sorted by author, then revision"));
            }
        }
        const expected = (lastByAuthor.get(patch.author) ?? 0) + 1;
        if (patch.revision !== expected) {
            return err(domainError("validation", `missing ${patch.author} revision ${String(expected)}`));
        }
        lastByAuthor.set(patch.author, patch.revision);
        previous = patch;
    }
    return ok(undefined);
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- decoded repository content is immutable throughout validation.
function validateClosure(raw) {
    const frontier = new Map(raw.frontier.components.map((component) => [component.contributorId, component.revision]));
    const dots = new Set();
    for (const patch of raw.patches)
        dots.add(dotKey(patch.author, patch.revision));
    const maxima = new Map();
    for (const patch of raw.patches) {
        const frontierRevision = frontier.get(patch.author) ?? 0;
        if (patch.revision > frontierRevision) {
            return err(domainError("validation", `unreachable patch: ${patch.author} revision ${String(patch.revision)}`));
        }
        maxima.set(patch.author, Math.max(maxima.get(patch.author) ?? 0, patch.revision));
        if (patch.revision !== baseRevision(patch.base, patch.author) + 1) {
            return err(domainError("validation", `patch (${patch.author}, ${String(patch.revision)}) revision must equal base[author] + 1`));
        }
    }
    for (const component of raw.frontier.components) {
        const maximum = maxima.get(component.contributorId) ?? 0;
        if (maximum !== component.revision) {
            return err(domainError("validation", `missing ${component.contributorId} revision ${String(maximum + 1)}`));
        }
    }
    for (const patch of raw.patches) {
        for (const dependency of patch.base.components) {
            if (!dots.has(dotKey(dependency.contributorId, dependency.revision))) {
                return err(domainError("validation", `missing dependency ${dependency.contributorId} revision ${String(dependency.revision)}`));
            }
        }
    }
    return ok(undefined);
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- base and decoded changes contain immutable byte arrays.
function validateChanges(base, raw) {
    const target = new Map(base);
    const changes = [];
    for (const change of raw.changes) {
        const existing = base.get(change.path);
        if (change.type === "delete") {
            if (existing === undefined)
                return err(domainError("validation", `delete of absent path: ${change.path}`));
            target.delete(change.path);
            changes.push(Object.freeze({ type: "delete", path: change.path }));
            continue;
        }
        if (change.type === "put") {
            if (existing !== undefined && bytesEqual(existing, change.content)) {
                return err(domainError("validation", `no-op change at path: ${change.path}`));
            }
            target.set(change.path, change.content);
            changes.push(Object.freeze({ type: "put", path: change.path, content: encodeBase64(change.content) }));
            continue;
        }
        let baseTokens;
        if (existing === undefined) {
            baseTokens = null;
        }
        else {
            const classified = classifyContent(existing);
            if (classified.kind !== "text") {
                return err(domainError("validation", `text change at path '${change.path}' requires a text base`));
            }
            baseTokens = classified.tokens;
        }
        const edit = constructEdit(change.editJson, baseTokens);
        if (!edit.ok)
            return err(domainError("validation", `text change at path '${change.path}': ${edit.error.detail}`));
        const applied = applyEdit(baseTokens ?? [], edit.value);
        if (!applied.ok)
            return applied;
        target.set(change.path, textEncoder.encode(joinTextTokens(applied.value)));
        changes.push(Object.freeze({ type: "text", path: change.path, edit: edit.value }));
    }
    const constructed = constructFileTree(target.entries());
    if (!constructed.ok) {
        return err(domainError("validation", `tree paths conflict in patch (${raw.author}, ${String(raw.revision)})`));
    }
    return ok(Object.freeze([Object.freeze(changes), constructed.value]));
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RawRepositoryDocument contains decoded byte arrays treated immutably.
export function validateRepository(raw) {
    const storage = validateStorage(raw.patches);
    if (!storage.ok)
        return storage;
    const closure = validateClosure(raw);
    if (!closure.ok)
        return closure;
    const scheduled = schedulePatches(raw.patches);
    if (!scheduled.ok)
        return err(domainError("validation", "cyclic or incomplete patch history"));
    const typedByDot = new Map();
    const validatedSoFar = [];
    for (const rawPatch of scheduled.value) {
        const partial = Object.freeze({
            format: 1,
            frontier: rawPatch.base,
            patches: Object.freeze([...validatedSoFar]),
        });
        let exactBase = new Map();
        if (formatVersion(rawPatch.base) !== formatVersion(EMPTY_VERSION)) {
            const materialized = materializeVersion(validationCandidate(partial), rawPatch.base);
            if (!materialized.ok)
                return materialized;
            exactBase = materialized.value.tree;
        }
        const validatedChanges = validateChanges(exactBase, rawPatch);
        if (!validatedChanges.ok)
            return validatedChanges;
        const patch = Object.freeze({
            author: rawPatch.author,
            revision: rawPatch.revision,
            base: rawPatch.base,
            message: rawPatch.message,
            changes: validatedChanges.value[0],
        });
        typedByDot.set(dotKey(patch.author, patch.revision), patch);
        validatedSoFar.push(patch);
    }
    const typedPatches = [];
    for (const rawPatch of raw.patches) {
        const typed = typedByDot.get(dotKey(rawPatch.author, rawPatch.revision));
        if (typed === undefined)
            return err(domainError("validation", "internal validation index is incomplete"));
        typedPatches.push(typed);
    }
    const document = Object.freeze({ format: 1, frontier: raw.frontier, patches: Object.freeze(typedPatches) });
    const repository = validationCandidate(document);
    const replayed = materializeVersion(repository, document.frontier);
    if (!replayed.ok)
        return replayed;
    return ok(repository);
}
