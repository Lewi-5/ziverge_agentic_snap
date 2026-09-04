import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { joinVersions } from "../version/compare.js";
import { dotKey, indexRepository } from "./index.js";
import { sortPatches } from "./patch.js";
import { patchesStructurallyEqual } from "./structural-equality.js";
import type { RepositoryDocument } from "./types.js";

/** Checks every common dot in the complete histories and returns the collision diagnostic on mismatch. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument values are deeply immutable.
export function checkPatchCollisions(left: RepositoryDocument, right: RepositoryDocument): Result<void, DomainError> {
  const rightIndex = indexRepository(right);
  for (const patch of left.patches) {
    const other = rightIndex.byDot.get(dotKey(patch.author, patch.revision));
    if (other !== undefined && !patchesStructurallyEqual(patch, other)) {
      return err(domainError("validation", `patch collision: ${patch.author} revision ${String(patch.revision)}`));
    }
  }
  return ok(undefined);
}

/** Pure typed set union plus componentwise frontier join. The candidate must still be fully revalidated. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument values are deeply immutable.
export function unionRepositoryDocuments(left: RepositoryDocument, right: RepositoryDocument): Result<RepositoryDocument, DomainError> {
  const collisions = checkPatchCollisions(left, right);
  if (!collisions.ok) return collisions;
  const patches = [...left.patches];
  const seen = indexRepository(left).byDot;
  for (const patch of right.patches) {
    if (!seen.has(dotKey(patch.author, patch.revision))) patches.push(patch);
  }
  return ok(Object.freeze({
    format: 1,
    frontier: joinVersions(left.frontier, right.frontier),
    patches: Object.freeze(sortPatches(patches)),
  }));
}
