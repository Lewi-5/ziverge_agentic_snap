import { decodeUtf8Strict } from "../json/decode-utf8.js";
import { tokenizeText } from "./tokenize.js";
export function classifyContent(input) {
    const bytes = Uint8Array.from(input);
    const immutableBytes = Object.freeze([...bytes]);
    if (bytes.includes(0)) {
        return Object.freeze({ kind: "binary", bytes: immutableBytes });
    }
    const decoded = decodeUtf8Strict(bytes);
    if (!decoded.ok) {
        return Object.freeze({ kind: "binary", bytes: immutableBytes });
    }
    return Object.freeze({
        kind: "text",
        text: decoded.value,
        tokens: tokenizeText(decoded.value),
        bytes: immutableBytes,
    });
}
