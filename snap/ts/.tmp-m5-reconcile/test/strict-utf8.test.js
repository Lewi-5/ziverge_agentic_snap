import test from "node:test";
import assert from "node:assert/strict";
import { decodeUtf8Strict } from "../src/domain/json/decode-utf8.js";
test("valid ASCII bytes decode unchanged", () => {
    const result = decodeUtf8Strict(new TextEncoder().encode("hello"));
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value, "hello");
    }
});
test("valid non-ASCII JSON string values decode without normalization", () => {
    const text = '{"contributor":{"id":"café@example.com"}}';
    const result = decodeUtf8Strict(new TextEncoder().encode(text));
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value, text);
    }
});
test("truncated multi-byte sequence is rejected", () => {
    const result = decodeUtf8Strict(new Uint8Array([0xc3]));
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.detail, "invalid UTF-8");
    }
});
test("overlong encoding is rejected", () => {
    const result = decodeUtf8Strict(new Uint8Array([0xc0, 0xaf]));
    assert.equal(result.ok, false);
});
test("lone surrogate encoded via WTF-8 is rejected", () => {
    const result = decodeUtf8Strict(new Uint8Array([0xed, 0xa0, 0x80]));
    assert.equal(result.ok, false);
});
test("does not silently substitute U+FFFD", () => {
    const result = decodeUtf8Strict(new Uint8Array([0x61, 0xff, 0x62]));
    assert.equal(result.ok, false);
});
