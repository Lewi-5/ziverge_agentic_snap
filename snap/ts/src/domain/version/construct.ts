import { domainError, escapeControlCharacters, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
import { isValidContributorId } from "./contributor-id.js";
import { EMPTY_VERSION, MAX_REVISION, type Version, type VersionComponent } from "./types.js";

/**
 * The single validating/canonicalizing constructor for `Version` values.
 * Every public producer of a `Version` (CLI text parsing, and later JSON
 * repository decoding, join) must route its component list through this
 * function rather than building a `Version` object directly, so there is
 * exactly one place that decides what a valid component list is. Rejects
 * invalid contributor ids, out-of-range revisions, and duplicate ids;
 * canonicalizes ordering; and freezes the result for runtime immutability.
 */
export function createVersion(components: readonly VersionComponent[]): Result<Version, DomainError> {
  if (components.length === 0) {
    return ok(EMPTY_VERSION);
  }

  const seenIds = new Set<string>();
  for (const component of components) {
    if (!isValidContributorId(component.contributorId)) {
      return err(
        domainError(
          "validation",
          `invalid contributor id '${escapeControlCharacters(component.contributorId)}'`,
        ),
      );
    }
    if (!Number.isInteger(component.revision) || component.revision < 1 || component.revision > MAX_REVISION) {
      return err(
        domainError("validation", `invalid revision for contributor '${component.contributorId}'`),
      );
    }
    if (seenIds.has(component.contributorId)) {
      return err(domainError("validation", `duplicate contributor id '${component.contributorId}'`));
    }
    seenIds.add(component.contributorId);
  }

  const sorted = sortByUnsignedUtf8(components, (component) => component.contributorId).map((component) =>
    Object.freeze({ ...component }),
  );
  return ok(Object.freeze({ components: Object.freeze(sorted) }) as unknown as Version);
}
