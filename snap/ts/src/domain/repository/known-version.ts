import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import type { Version } from "../version/types.js";
import { indexRepository } from "./index.js";
import type { Patch, RepositoryDocument } from "./types.js";

function selectedRevision(version: Version, author: string): number {
  return version.components.find((component) => component.contributorId === author)?.revision ?? 0;
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- repository and version are immutable domain values.
export function selectKnownPatches(document: RepositoryDocument, version: Version): Result<readonly Patch[], DomainError> {
  const index = indexRepository(document);
  for (const component of version.components) {
    const maximum = index.maximumRevisionByAuthor.get(component.contributorId) ?? 0;
    if (component.revision > maximum) {
      return err(domainError("validation", `version is not known: missing patch (${component.contributorId}, ${String(component.revision)})`));
    }
  }

  const selected: Patch[] = [];
  for (const patch of document.patches) {
    if (patch.revision <= selectedRevision(version, patch.author)) selected.push(patch);
  }
  for (const patch of selected) {
    for (const dependency of patch.base.components) {
      if (dependency.revision > selectedRevision(version, dependency.contributorId)) {
        return err(domainError("validation", `version is not known: patch (${patch.author}, ${String(patch.revision)}) has an omitted dependency`));
      }
    }
  }
  return ok(Object.freeze(selected));
}
