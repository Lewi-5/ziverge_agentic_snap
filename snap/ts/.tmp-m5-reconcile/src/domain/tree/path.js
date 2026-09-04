import { domainError, escapeControlCharacters } from "../errors.js";
import { err, ok } from "../result.js";
/** The single validating constructor for `TrackedPath` (SPEC §2). */
export function createTrackedPath(text) {
    if (text.length === 0) {
        return err(domainError("validation", "tracked path must not be empty"));
    }
    if (text.includes("\\")) {
        return err(domainError("validation", `tracked path must not contain a backslash: '${escapeControlCharacters(text)}'`));
    }
    for (let index = 0; index < text.length; index += 1) {
        const codePoint = text.charCodeAt(index);
        if (codePoint < 0x20 || codePoint === 0x7f) {
            return err(domainError("validation", `tracked path must not contain an ASCII control character: '${escapeControlCharacters(text)}'`));
        }
        if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
            const next = text.charCodeAt(index + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff)) {
                return err(domainError("validation", `tracked path contains an unpaired surrogate: '${escapeControlCharacters(text)}'`));
            }
            index += 1;
        }
        else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
            return err(domainError("validation", `tracked path contains an unpaired surrogate: '${escapeControlCharacters(text)}'`));
        }
    }
    const segments = text.split("/");
    for (const segment of segments) {
        if (segment.length === 0 || segment === "." || segment === "..") {
            return err(domainError("validation", `tracked path must not contain an empty, '.', or '..' segment: '${text}'`));
        }
    }
    if (segments[0] === ".snap") {
        return err(domainError("validation", `tracked path must not begin with '.snap': '${text}'`));
    }
    return ok(text);
}
/** True when `path` is `prefix` itself or nested under it as a path segment (e.g. `a` is a prefix of `a/b`, not of `ab`). */
export function isPathOrDescendant(path, prefix) {
    return path === prefix || path.startsWith(`${prefix}/`);
}
