import { domainError, escapeControlCharacters } from "../errors.js";
import { err, ok } from "../result.js";
import { createContributorId } from "../version/contributor-id.js";
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Validates the exact configuration schema `{"contributor":{"id":"<id>"}}`
 * (SPEC §8): a non-array object containing only `contributor`, itself a
 * non-array object containing only a string `id` that passes the shared
 * contributor-ID constructor. Any missing field, wrong type, or unknown
 * field at either level is rejected.
 */
export function validateConfiguration(value) {
    if (!isPlainObject(value)) {
        return err(domainError("validation", "invalid configuration: expected an object"));
    }
    for (const key of Object.keys(value)) {
        if (key !== "contributor") {
            return err(domainError("validation", `unknown field in configuration: ${escapeControlCharacters(key)}`));
        }
    }
    const contributor = Object.hasOwn(value, "contributor") ? value["contributor"] : undefined;
    if (contributor === undefined) {
        return err(domainError("validation", "missing field in configuration: contributor"));
    }
    if (!isPlainObject(contributor)) {
        return err(domainError("validation", "invalid configuration: contributor must be an object"));
    }
    for (const key of Object.keys(contributor)) {
        if (key !== "id") {
            return err(domainError("validation", `unknown field in configuration: ${escapeControlCharacters(key)}`));
        }
    }
    const id = Object.hasOwn(contributor, "id") ? contributor["id"] : undefined;
    if (id === undefined) {
        return err(domainError("validation", "missing field in configuration: contributor.id"));
    }
    if (typeof id !== "string") {
        return err(domainError("validation", "invalid configuration: contributor.id must be a string"));
    }
    const contributorId = createContributorId(id);
    if (!contributorId.ok) {
        return contributorId;
    }
    return ok({ contributor: { id: contributorId.value } });
}
