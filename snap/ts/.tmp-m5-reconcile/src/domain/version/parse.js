import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { createVersion } from "./construct.js";
import { isValidContributorId } from "./contributor-id.js";
import { EMPTY_VERSION, MAX_REVISION } from "./types.js";
const REVISION_DIGITS = /^[0-9]+$/;
function invalid(detail) {
    return err(domainError("validation", detail));
}
/**
 * Parses SPEC §3.2 canonical CLI version syntax. Handles text-specific
 * concerns (bracket/whitespace syntax, per-component splitting, and revision
 * *text* format such as leading zeros) itself, then routes the parsed
 * component list through the single validating constructor (createVersion)
 * for id/revision/duplicate validation shared with every other producer of a
 * Version.
 */
export function parseVersion(text) {
    if (text === "()") {
        return ok(EMPTY_VERSION);
    }
    if (/\s/u.test(text)) {
        return invalid("version must not contain whitespace");
    }
    if (!text.startsWith("(") || !text.endsWith(")")) {
        return invalid(`malformed version syntax '${text}'`);
    }
    const inner = text.slice(1, -1);
    if (inner.length === 0) {
        return invalid(`malformed version syntax '${text}'`);
    }
    const parts = inner.split(",");
    const components = [];
    let previousId;
    for (const part of parts) {
        const arrowIndex = part.indexOf("->");
        if (arrowIndex < 0) {
            return invalid(`malformed version component '${part}'`);
        }
        const contributorId = part.slice(0, arrowIndex);
        const revisionText = part.slice(arrowIndex + 2);
        if (!isValidContributorId(contributorId)) {
            return invalid(`invalid contributor id '${contributorId}'`);
        }
        if (!REVISION_DIGITS.test(revisionText)) {
            return invalid(`invalid revision '${revisionText}' for contributor '${contributorId}'`);
        }
        if (revisionText === "0") {
            return invalid(`revision 0 is not allowed for contributor '${contributorId}'`);
        }
        if (revisionText.length > 1 && revisionText.startsWith("0")) {
            return invalid(`revision '${revisionText}' has a leading zero`);
        }
        if (BigInt(revisionText) > BigInt(MAX_REVISION)) {
            return invalid(`revision '${revisionText}' exceeds the maximum safe integer`);
        }
        if (previousId !== undefined) {
            const order = compareUnsignedUtf8(previousId, contributorId);
            if (order === 0) {
                return invalid(`duplicate contributor id '${contributorId}'`);
            }
            if (order > 0) {
                return invalid("version components must be in canonical unsigned UTF-8 order");
            }
        }
        previousId = contributorId;
        components.push({ contributorId, revision: Number(revisionText) });
    }
    return createVersion(components);
}
