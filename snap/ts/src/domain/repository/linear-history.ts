import { encodeBase64 } from "../content/base64.js";
import { classifyContent } from "../content/classify.js";
import type { TextToken } from "../content/types.js";
import { applyEdit } from "../edit/apply.js";
import { constructEdit } from "../edit/construct.js";
import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { bytesEqual, type FileTree } from "../tree/change.js";
import { constructFileTree } from "../tree/construct.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { formatVersion } from "../version/format.js";
import { EMPTY_VERSION, type Version } from "../version/types.js";
import { joinTextTokens } from "../content/tokenize.js";
import { computePatchResult } from "./patch.js";
import type { RawChange, RawPatch, RawRepositoryDocument } from "./schema.js";
import { makeLinearRepository, type Change, type LinearRepository, type Patch, type RepositoryDocument } from "./types.js";

const textEncoder = new TextEncoder();

function priorRevision(base: Version, author: string): number {
  return base.components.find((component) => component.contributorId === author)?.revision ?? 0;
}

/** SPEC §4.1: `patches` is stored sorted by author, then numeric revision, with contiguous per-author revisions starting at 1. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RawPatch nests a `put` change's Uint8Array content; Uint8Array is the configured byte-container exception.
function checkStorageOrder(patches: readonly RawPatch[]): Result<void, DomainError> {
  const lastRevisionByAuthor = new Map<string, number>();
  let previous: RawPatch | undefined;
  for (const patch of patches) {
    if (previous !== undefined) {
      const order = compareUnsignedUtf8(previous.author, patch.author);
      if (order > 0) {
        return err(domainError("validation", "repository patches must be sorted by author, then revision"));
      }
      if (order === 0 && previous.revision >= patch.revision) {
        return err(domainError("validation", "repository patches must be sorted by author, then revision"));
      }
    }
    const expected = (lastRevisionByAuthor.get(patch.author) ?? 0) + 1;
    if (patch.revision !== expected) {
      return err(domainError("validation", `contributor '${patch.author}' revisions must be contiguous starting at 1`));
    }
    lastRevisionByAuthor.set(patch.author, patch.revision);
    previous = patch;
  }
  return ok(undefined);
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- `tree` is intentionally mutated in place; Uint8Array is the configured byte-container exception.
function materializeChange(tree: Map<string, Uint8Array>, raw: RawChange): Result<Change, DomainError> {
  const existing = tree.get(raw.path);
  if (raw.type === "delete") {
    if (existing === undefined) {
      return err(domainError("validation", `delete change requires path '${raw.path}' to be present in its base`));
    }
    tree.delete(raw.path);
    return ok(Object.freeze({ type: "delete", path: raw.path }));
  }
  if (raw.type === "put") {
    if (existing !== undefined && bytesEqual(existing, raw.content)) {
      return err(domainError("validation", `put change at path '${raw.path}' does not alter bytes`));
    }
    tree.set(raw.path, raw.content);
    return ok(Object.freeze({ type: "put", path: raw.path, content: encodeBase64(raw.content) }));
  }

  // text
  let baseTokens: readonly TextToken[] | null;
  if (existing === undefined) {
    baseTokens = null;
  } else {
    const classified = classifyContent(existing);
    if (classified.kind !== "text") {
      return err(domainError("validation", `text change at path '${raw.path}' requires a text base`));
    }
    baseTokens = classified.tokens;
  }
  const edit = constructEdit(raw.editJson, baseTokens);
  if (!edit.ok) {
    return err(domainError("validation", `text change at path '${raw.path}': ${edit.error.detail}`));
  }
  const applied = applyEdit(baseTokens ?? [], edit.value);
  if (!applied.ok) {
    return err(domainError("validation", `text change at path '${raw.path}': ${applied.error.detail}`));
  }
  tree.set(raw.path, textEncoder.encode(joinTextTokens(applied.value)));
  return ok(Object.freeze({ type: "text", path: raw.path, edit: edit.value }));
}

/**
 * Validates and materializes a decoded repository document as a **generated
 * linear history**: exactly the serial (possibly multi-author) histories
 * `commit` produces, with no concurrency, merge, or causal branching. This
 * is intentionally narrower than M5's eventual arbitrary-causal
 * `ValidatedRepository`, which additionally validates closure over an
 * arbitrary DAG, exact-base semantics under concurrency, and replay/OT
 * (module3planCORRECTIONS.md #8). No command may treat a `LinearRepository`
 * as if it had passed that stronger validator.
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RawRepositoryDocument nests a `put` change's Uint8Array content; Uint8Array is the configured byte-container exception.
export function validateLinearRepository(raw: RawRepositoryDocument): Result<LinearRepository, DomainError> {
  const storageOrder = checkStorageOrder(raw.patches);
  if (!storageOrder.ok) {
    return storageOrder;
  }

  for (const patch of raw.patches) {
    if (patch.revision !== priorRevision(patch.base, patch.author) + 1) {
      return err(domainError("validation", `patch (${patch.author}, ${String(patch.revision)}) revision must equal base[author] + 1`));
    }
  }

  const patchesByBaseKey = new Map<string, RawPatch>();
  for (const patch of raw.patches) {
    const key = formatVersion(patch.base);
    if (patchesByBaseKey.has(key)) {
      return err(domainError("validation", `more than one patch shares base ${key}; concurrent/branching history is not a generated linear history`));
    }
    patchesByBaseKey.set(key, patch);
  }

  const chain: RawPatch[] = [];
  let current: Version = EMPTY_VERSION;
  let currentKey = formatVersion(current);
  for (;;) {
    const next = patchesByBaseKey.get(currentKey);
    if (next === undefined) {
      break;
    }
    chain.push(next);
    const advanced = computePatchResult(current, next.author, next.revision);
    if (!advanced.ok) {
      return advanced;
    }
    current = advanced.value;
    currentKey = formatVersion(current);
  }

  if (chain.length !== raw.patches.length) {
    return err(domainError("validation", "repository patches do not form a single linear chain from the empty tree"));
  }
  if (currentKey !== formatVersion(raw.frontier)) {
    return err(domainError("validation", "repository frontier does not match the materialized patch chain"));
  }

  const tree = new Map<string, Uint8Array>();
  const validatedPatches: Patch[] = [];
  const emptyTreeSnapshot = constructFileTree([]);
  if (!emptyTreeSnapshot.ok) {
    return emptyTreeSnapshot;
  }
  const versions = new Map<string, FileTree>();
  versions.set(formatVersion(EMPTY_VERSION), emptyTreeSnapshot.value);
  let runningVersion: Version = EMPTY_VERSION;
  for (const patch of chain) {
    const changes: Change[] = [];
    for (const rawChange of patch.changes) {
      const materialized = materializeChange(tree, rawChange);
      if (!materialized.ok) {
        return materialized;
      }
      changes.push(materialized.value);
    }
    const treeCheck = constructFileTree(tree.entries());
    if (!treeCheck.ok) {
      return treeCheck;
    }
    validatedPatches.push(
      Object.freeze({
        author: patch.author,
        revision: patch.revision,
        base: patch.base,
        message: patch.message,
        changes: Object.freeze(changes),
      }),
    );
    const advanced = computePatchResult(runningVersion, patch.author, patch.revision);
    if (!advanced.ok) {
      return advanced;
    }
    runningVersion = advanced.value;
    versions.set(formatVersion(runningVersion), treeCheck.value);
  }

  const document: RepositoryDocument = Object.freeze({
    format: 1,
    frontier: raw.frontier,
    patches: Object.freeze(validatedPatches),
  });
  return ok(makeLinearRepository(document, versions));
}
