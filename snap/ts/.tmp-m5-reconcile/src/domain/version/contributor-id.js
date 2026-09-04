import { domainError, escapeControlCharacters } from "../errors.js";
import { err, ok } from "../result.js";
const encoder = new TextEncoder();
const MAX_CONTRIBUTOR_ID_BYTES = 254;
function isAsciiControlOrWhitespace(charCode) {
    return charCode <= 0x20 || charCode === 0x7f;
}
/**
 * SPEC §3.1: an ASCII email-shaped string containing exactly one "@" with
 * nonempty text on both sides; no control character, whitespace, ",", "(",
 * ")", or substring "->"; at most 254 bytes.
 */
export function isValidContributorId(id) {
    if (id.length === 0 || encoder.encode(id).length > MAX_CONTRIBUTOR_ID_BYTES) {
        return false;
    }
    for (let index = 0; index < id.length; index += 1) {
        const charCode = id.charCodeAt(index);
        if (charCode > 0x7e || isAsciiControlOrWhitespace(charCode)) {
            return false;
        }
    }
    if (id.includes(",") || id.includes("(") || id.includes(")") || id.includes("->")) {
        return false;
    }
    const atIndex = id.indexOf("@");
    if (atIndex <= 0 || atIndex !== id.lastIndexOf("@") || atIndex === id.length - 1) {
        return false;
    }
    return true;
}
/** The single validating constructor for `ContributorId` (SPEC §3.1). */
export function createContributorId(id) {
    if (!isValidContributorId(id)) {
        return err(domainError("validation", `invalid contributor id: ${escapeControlCharacters(id)}`));
    }
    return ok(id);
}
