import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
import { indexRepository } from "./index.js";
function selectedRevision(version, author) {
    return version.components.find((component) => component.contributorId === author)?.revision ?? 0;
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- repository and version are immutable domain values.
export function selectKnownPatches(repository, version) {
    const { document } = repository;
    const index = indexRepository(document);
    for (const component of version.components) {
        const maximum = index.maximumRevisionByAuthor.get(component.contributorId) ?? 0;
        if (component.revision > maximum) {
            return err(domainError("validation", `version is not known: missing patch (${component.contributorId}, ${String(component.revision)})`));
        }
    }
    const selected = [];
    for (const patch of document.patches) {
        if (patch.revision <= selectedRevision(version, patch.author))
            selected.push(patch);
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
