import test from "node:test";
import assert from "node:assert/strict";
import { compareUnsignedUtf8, sortByUnsignedUtf8 } from "../src/domain/unsigned-utf8.js";

test("ASCII order and prefix rule", () => {
  assert.equal(compareUnsignedUtf8("a", "b"), -1);
  assert.equal(compareUnsignedUtf8("b", "a"), 1);
  assert.equal(compareUnsignedUtf8("a", "a"), 0);
  assert.equal(compareUnsignedUtf8("abc", "abcd"), -1);
  assert.equal(compareUnsignedUtf8("abcd", "abc"), 1);
});

test("case sensitivity: uppercase sorts before lowercase", () => {
  assert.equal(compareUnsignedUtf8("A", "a"), -1);
});

test("accented characters sort by UTF-8 bytes, after plain ASCII", () => {
  assert.equal(compareUnsignedUtf8("e", "é"), -1); // "e" vs "é" (0xC3 0xA9)
  assert.equal(compareUnsignedUtf8("z", "é"), -1); // "z" (0x7A) < 0xC3
});

test("emoji (4-byte UTF-8) sorts after BMP ASCII/Latin text", () => {
  assert.equal(compareUnsignedUtf8("z", "\u{1F600}"), -1);
});

test("trailing space is a proper byte-prefix extension", () => {
  assert.equal(compareUnsignedUtf8("abc", "abc "), -1);
});

test("sortByUnsignedUtf8 sorts a mixed sample by key", () => {
  const items = ["banana", "Apple", "éclair", "apple"];
  const sorted = sortByUnsignedUtf8(items, (item) => item);
  assert.deepEqual(sorted, ["Apple", "apple", "banana", "éclair"]);
});
