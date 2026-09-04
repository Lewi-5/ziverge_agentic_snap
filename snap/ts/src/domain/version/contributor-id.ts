import { domainError, escapeControlCharacters, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";

const encoder = new TextEncoder();
const MAX_CONTRIBUTOR_ID_BYTES = 254;

function isAsciiControlOrWhitespace(charCode: number): boolean {
  return charCode <= 0x20 || charCode === 0x7f;
}

/**
 * SPEC §3.1: an ASCII email-shaped string containing exactly one "@" with
 * nonempty text on both sides; no control character, whitespace, ",", "(",
 * ")", or substring "->"; at most 254 bytes.
 */
export function isValidContributorId(id: string): boolean {
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

/**
 * A contributor ID that has passed `isValidContributorId`. Application and
 * config code carry this branded value rather than an unchecked `string` so
 * an unvalidated ID cannot silently reach a patch author or config document.
 */
export type ContributorId = string & { readonly __brand: "ContributorId" };

/** The single validating constructor for `ContributorId` (SPEC §3.1). */
export function createContributorId(id: string): Result<ContributorId, DomainError> {
  if (!isValidContributorId(id)) {
    return err(domainError("validation", `invalid contributor id: ${escapeControlCharacters(id)}`));
  }
  return ok(id as ContributorId);
}
