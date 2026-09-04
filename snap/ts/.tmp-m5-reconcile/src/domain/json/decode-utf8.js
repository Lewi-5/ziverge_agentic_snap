import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
/**
 * Decodes bytes as UTF-8, rejecting malformed sequences instead of Node's
 * `fs.readFile(path, "utf8")` and `TextDecoder`'s default lossy substitution
 * of U+FFFD (PLAN.md "Validation boundary").
 */
export function decodeUtf8Strict(bytes) {
    try {
        return ok(fatalUtf8Decoder.decode(bytes));
    }
    catch {
        return err(domainError("validation", "invalid UTF-8"));
    }
}
