import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Decodes bytes as UTF-8, rejecting malformed sequences instead of Node's
 * `fs.readFile(path, "utf8")` and `TextDecoder`'s default lossy substitution
 * of U+FFFD (PLAN.md "Validation boundary").
 */
export function decodeUtf8Strict(bytes: Uint8Array): Result<string, DomainError> {
  try {
    return ok(fatalUtf8Decoder.decode(bytes));
  } catch {
    return err(domainError("validation", "invalid UTF-8"));
  }
}
