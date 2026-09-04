import test from "node:test";
import assert from "node:assert/strict";
import { validateMessage } from "../src/domain/repository/message.js";
test("rejects an empty message", () => {
    assert.equal(validateMessage("").ok, false);
});
test("accepts tab and LF inside a message", () => {
    const result = validateMessage("a\tb\nc");
    assert.equal(result.ok, true);
});
test("rejects another ASCII control character", () => {
    assert.equal(validateMessage("ab").ok, false);
});
test("preserves trailing spaces and does not trim", () => {
    const result = validateMessage("hello   ");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value, "hello   ");
    }
});
test("no cap by default: accepts a message far larger than 4096 bytes", () => {
    const result = validateMessage("x".repeat(5000));
    assert.equal(result.ok, true);
});
test("exactly 4096 UTF-8 bytes is accepted with maxBytes: 4096", () => {
    const result = validateMessage("x".repeat(4096), { maxBytes: 4096 });
    assert.equal(result.ok, true);
});
test("4097 UTF-8 bytes is rejected with maxBytes: 4096", () => {
    const result = validateMessage("x".repeat(4097), { maxBytes: 4096 });
    assert.equal(result.ok, false);
});
test("byte cap counts UTF-8 bytes, not UTF-16 code units", () => {
    // "😀" is 4 UTF-8 bytes but 2 UTF-16 code units.
    const result = validateMessage("😀".repeat(1024), { maxBytes: 4096 });
    assert.equal(result.ok, true);
    const overLimit = validateMessage(`${"😀".repeat(1024)}x`, { maxBytes: 4096 });
    assert.equal(overLimit.ok, false);
});
