import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { createVersion } from "../version/construct.js";
import { MAX_REVISION } from "../version/types.js";
/**
 * SPEC §4.2: a patch's result is its base with `result[author] = revision`;
 * every other component is unchanged. The single implementation reused by
 * both M5 history replay and `commit` (computing the version to print after
 * publishing a new patch).
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- `Version`'s components are already readonly/frozen; the rule does not recognize the branded interface as deeply readonly.
export function computePatchResult(base, author, revision) {
    const components = base.components.filter((component) => component.contributorId !== author).concat({ contributorId: author, revision });
    return createVersion(components);
}
/**
 * Constructs a new patch from the current frontier (`base`), the resolved
 * author, a validated message, and the sorted nonempty change set M4's
 * `selectAuthoredChanges` produced. `revision = base[author] + 1`
 * (SPEC §4.2); fails on safe-integer overflow.
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- all fields are already `readonly`; the rule does not recognize the readonly `Change` union as deeply readonly.
export function constructPatch(input) {
    if (input.changes.length === 0) {
        return err(domainError("validation", "a patch must have at least one change"));
    }
    const priorRevision = input.base.components.find((component) => component.contributorId === input.author)?.revision ?? 0;
    if (priorRevision >= MAX_REVISION) {
        return err(domainError("validation", `contributor '${input.author}' has reached the maximum revision`));
    }
    const revision = priorRevision + 1;
    return ok(Object.freeze({
        author: input.author,
        revision,
        base: input.base,
        message: input.message,
        changes: input.changes,
    }));
}
/** SPEC §4.1: `patches` is stored sorted by author, then numeric revision. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Patch is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
export function sortPatches(patches) {
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Patch is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
    return [...patches].sort((left, right) => {
        const order = compareUnsignedUtf8(left.author, right.author);
        if (order !== 0)
            return order;
        return left.revision === right.revision ? 0 : left.revision < right.revision ? -1 : 1;
    });
}
