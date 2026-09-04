import { domainError, escapeControlCharacters, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";

const encoder = new TextEncoder();

/**
 * The single validating constructor for a patch `message` (SPEC §4.2): a
 * nonempty UTF-8 string that may contain tab and LF but no other ASCII
 * control character. `domain/repository/schema.ts` calls this with no byte
 * cap when decoding a patch's message (a generated revert message may be
 * longer). `commit` calls it with `maxBytes: 4096` for the user-supplied
 * message and discards the detail in favor of the exact SPEC §7.5
 * diagnostic (module3planCORRECTIONS.md #4).
 */
export function validateMessage(text: string, options?: { readonly maxBytes?: number }): Result<string, DomainError> {
  if (text.length === 0) {
    return err(domainError("validation", "patch message is empty"));
  }
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index);
    if (codePoint === 0x7f || (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a)) {
      return err(domainError("validation", `message must not contain an ASCII control character other than tab/LF: '${escapeControlCharacters(text)}'`));
    }
  }
  const maxBytes = options?.maxBytes;
  if (maxBytes !== undefined && encoder.encode(text).length > maxBytes) {
    return err(domainError("validation", `message exceeds ${String(maxBytes)} UTF-8 bytes`));
  }
  return ok(text);
}
