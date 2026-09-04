import { domainError } from "../errors.js";
import { err, ok } from "../result.js";
/** Internal control-flow error for one strict-parse attempt; never escapes `parseJsonStrict`. */
class JsonSyntaxError extends Error {
}
/**
 * A strict JSON parser used in place of `JSON.parse`, which silently keeps
 * only the last of two duplicate object keys and therefore cannot detect
 * them. Implements the full JSON grammar (RFC 8259) via recursive descent so
 * every object literal, at any depth, can be checked for a repeated decoded
 * key (PLAN.md "Validation boundary"; SPEC.md §§4.1, 8).
 */
export function parseJsonStrict(text) {
    let index = 0;
    function peekChar() {
        return text[index] ?? "";
    }
    function skipWhitespace() {
        for (;;) {
            const character = peekChar();
            if (character === " " || character === "\t" || character === "\n" || character === "\r") {
                index += 1;
            }
            else {
                return;
            }
        }
    }
    function expect(character) {
        if (peekChar() !== character) {
            throw new JsonSyntaxError(`expected '${character}' at position ${String(index)}`);
        }
        index += 1;
    }
    function parseValue() {
        const character = peekChar();
        if (character === "{") {
            return parseObject();
        }
        if (character === "[") {
            return parseArray();
        }
        if (character === '"') {
            return parseString();
        }
        if (character === "-" || (character >= "0" && character <= "9")) {
            return parseNumber();
        }
        if (text.startsWith("true", index)) {
            index += 4;
            return true;
        }
        if (text.startsWith("false", index)) {
            index += 5;
            return false;
        }
        if (text.startsWith("null", index)) {
            index += 4;
            return null;
        }
        throw new JsonSyntaxError(`unexpected character at position ${String(index)}`);
    }
    function parseObject() {
        expect("{");
        const result = {};
        const seenKeys = new Set();
        skipWhitespace();
        if (peekChar() === "}") {
            index += 1;
            return result;
        }
        for (;;) {
            skipWhitespace();
            if (peekChar() !== '"') {
                throw new JsonSyntaxError(`expected string key at position ${String(index)}`);
            }
            const key = parseString();
            if (seenKeys.has(key)) {
                throw new JsonSyntaxError(`duplicate JSON key ${JSON.stringify(key)}`);
            }
            seenKeys.add(key);
            skipWhitespace();
            expect(":");
            skipWhitespace();
            const val = parseValue();
            Object.defineProperty(result, key, {
                value: val,
                writable: true,
                enumerable: true,
                configurable: true,
            });
            skipWhitespace();
            const next = peekChar();
            if (next === ",") {
                index += 1;
                continue;
            }
            if (next === "}") {
                index += 1;
                return result;
            }
            throw new JsonSyntaxError(`expected ',' or '}' at position ${String(index)}`);
        }
    }
    function parseArray() {
        expect("[");
        const result = [];
        skipWhitespace();
        if (peekChar() === "]") {
            index += 1;
            return result;
        }
        for (;;) {
            skipWhitespace();
            result.push(parseValue());
            skipWhitespace();
            const next = peekChar();
            if (next === ",") {
                index += 1;
                continue;
            }
            if (next === "]") {
                index += 1;
                return result;
            }
            throw new JsonSyntaxError(`expected ',' or ']' at position ${String(index)}`);
        }
    }
    function parseString() {
        expect('"');
        let result = "";
        for (;;) {
            if (index >= text.length) {
                throw new JsonSyntaxError("unterminated string");
            }
            const character = text[index] ?? "";
            if (character === '"') {
                index += 1;
                return result;
            }
            if (character === "\\") {
                index += 1;
                const escapeChar = text[index];
                if (escapeChar === undefined) {
                    throw new JsonSyntaxError("unterminated escape sequence");
                }
                switch (escapeChar) {
                    case '"':
                        result += '"';
                        index += 1;
                        break;
                    case "\\":
                        result += "\\";
                        index += 1;
                        break;
                    case "/":
                        result += "/";
                        index += 1;
                        break;
                    case "b":
                        result += "\b";
                        index += 1;
                        break;
                    case "f":
                        result += "\f";
                        index += 1;
                        break;
                    case "n":
                        result += "\n";
                        index += 1;
                        break;
                    case "r":
                        result += "\r";
                        index += 1;
                        break;
                    case "t":
                        result += "\t";
                        index += 1;
                        break;
                    case "u": {
                        const hex = text.slice(index + 1, index + 5);
                        if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
                            throw new JsonSyntaxError(`invalid unicode escape at position ${String(index)}`);
                        }
                        result += String.fromCharCode(parseInt(hex, 16));
                        index += 5;
                        break;
                    }
                    default:
                        throw new JsonSyntaxError(`invalid escape character at position ${String(index)}`);
                }
                continue;
            }
            const codePoint = character.codePointAt(0) ?? 0;
            if (codePoint < 0x20) {
                throw new JsonSyntaxError(`unescaped control character at position ${String(index)}`);
            }
            result += character;
            index += 1;
        }
    }
    function parseNumber() {
        const start = index;
        const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
        if (match === null || match[0].length === 0) {
            throw new JsonSyntaxError(`invalid number at position ${String(start)}`);
        }
        index += match[0].length;
        return Number(match[0]);
    }
    try {
        skipWhitespace();
        const value = parseValue();
        skipWhitespace();
        if (index !== text.length) {
            throw new JsonSyntaxError(`unexpected trailing content at position ${String(index)}`);
        }
        return ok(value);
    }
    catch (error) {
        if (error instanceof JsonSyntaxError) {
            if (error.message.startsWith("duplicate JSON key ")) {
                return err(domainError("validation", error.message));
            }
            return err(domainError("validation", `invalid JSON: ${error.message}`));
        }
        throw error;
    }
}
