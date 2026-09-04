import test from "node:test";
import assert from "node:assert/strict";
import { decodeBase64, encodeBase64 } from "../src/domain/content/base64.js";
test("canonical padded RFC 4648 examples round trip", () => {
    const examples = [
        [[], ""], [[0], "AA=="], [[0, 1], "AAE="], [[0, 1, 2], "AAEC"],
        [[102], "Zg=="], [[102, 111], "Zm8="], [[102, 111, 111], "Zm9v"],
    ];
    for (const [bytes, spelling] of examples) {
        assert.equal(encodeBase64(new Uint8Array(bytes)), spelling);
        const decoded = decodeBase64(spelling);
        assert.equal(decoded.ok, true);
        if (decoded.ok)
            assert.deepEqual([...decoded.value], bytes);
    }
});
test("base64 decoder rejects junk, whitespace, bad padding, and noncanonical pad bits", () => {
    for (const value of ["A", "AAA", "AA=A", "AA===", "AA==\n", "AA-_", "AB==", "AAF="]) {
        assert.equal(decodeBase64(value).ok, false, value);
    }
});
test("arbitrary deterministic bytes round trip", () => {
    for (let length = 0; length < 80; length += 1) {
        const bytes = Uint8Array.from({ length }, (_, index) => (index * 73 + length * 19) & 0xff);
        const decoded = decodeBase64(encodeBase64(bytes));
        assert.equal(decoded.ok, true);
        if (decoded.ok)
            assert.deepEqual(decoded.value, bytes);
    }
});
