import { domainError } from "../errors.js";
import { err } from "../result.js";
import { computePatchResult } from "../repository/patch.js";
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Version is an immutable branded value, but the rule cannot see through its brand.
export function patchResult(patch) {
    const prior = patch.base.components.find((component) => component.contributorId === patch.author)?.revision ?? 0;
    if (patch.revision !== prior + 1) {
        return err(domainError("validation", `patch (${patch.author}, ${String(patch.revision)}) revision must equal base[author] + 1`));
    }
    return computePatchResult(patch.base, patch.author, patch.revision);
}
