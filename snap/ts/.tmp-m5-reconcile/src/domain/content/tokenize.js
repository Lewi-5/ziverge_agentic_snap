import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
export function tokenizeText(text) {
    if (text.length === 0) {
        return Object.freeze([]);
    }
    const tokens = [];
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) === 0x0a) {
            tokens.push(text.slice(start, index + 1));
            start = index + 1;
        }
    }
    if (start < text.length) {
        tokens.push(text.slice(start));
    }
    return Object.freeze(tokens);
}
export function validateTokenSequence(value) {
    if (!Array.isArray(value)) {
        return err(domainError("validation", "text tokens must be an array"));
    }
    const tokens = [];
    for (let index = 0; index < value.length; index += 1) {
        const token = value[index];
        if (typeof token !== "string" || token.length === 0) {
            return err(domainError("validation", `text token ${String(index)} must be a nonempty string`));
        }
        for (let offset = 0; offset < token.length; offset += 1) {
            const unit = token.charCodeAt(offset);
            if (unit === 0) {
                return err(domainError("validation", `text token ${String(index)} contains NUL byte`));
            }
            if (unit >= 0xd800 && unit <= 0xdbff) {
                const next = token.charCodeAt(offset + 1);
                if (!(next >= 0xdc00 && next <= 0xdfff)) {
                    return err(domainError("validation", `text token ${String(index)} contains an unpaired surrogate`));
                }
                offset += 1;
            }
            else if (unit >= 0xdc00 && unit <= 0xdfff) {
                return err(domainError("validation", `text token ${String(index)} contains an unpaired surrogate`));
            }
        }
        const lf = token.indexOf("\n");
        if (lf !== -1 && lf !== token.length - 1) {
            return err(domainError("validation", `text token ${String(index)} contains LF before its end`));
        }
        if (index < value.length - 1 && !token.endsWith("\n")) {
            return err(domainError("validation", `text token ${String(index)} must end with LF`));
        }
        tokens.push(token);
    }
    return ok(Object.freeze(tokens));
}
export function joinTextTokens(tokens) {
    return tokens.join("");
}
