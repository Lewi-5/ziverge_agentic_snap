import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { createVersion } from "../version/construct.js";
import type { ContributorId } from "../version/contributor-id.js";
import { MAX_REVISION, type Version } from "../version/types.js";
import type { Change, Patch } from "./types.js";

/**
 * SPEC §4.2: a patch's result is its base with `result[author] = revision`;
 * every other component is unchanged. The single implementation reused by
 * both `linear-history.ts` (replaying an existing chain) and `commit`
 * (computing the version to print after publishing a new patch).
 */
export function computePatchResult(base: Version, author: ContributorId, revision: number): Result<Version, DomainError> {
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
export function constructPatch(input: {
  readonly author: ContributorId;
  readonly base: Version;
  readonly message: string;
  readonly changes: readonly Change[];
}): Result<Patch, DomainError> {
  if (input.changes.length === 0) {
    return err(domainError("validation", "a patch must have at least one change"));
  }
  const priorRevision = input.base.components.find((component) => component.contributorId === input.author)?.revision ?? 0;
  if (priorRevision >= MAX_REVISION) {
    return err(domainError("validation", `contributor '${input.author}' has reached the maximum revision`));
  }
  const revision = priorRevision + 1;
  return ok(
    Object.freeze({
      author: input.author,
      revision,
      base: input.base,
      message: input.message,
      changes: input.changes,
    }),
  );
}
