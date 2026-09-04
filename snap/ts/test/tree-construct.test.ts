import test from "node:test";
import assert from "node:assert/strict";
import { constructFileTree } from "../src/domain/tree/construct.js";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

test("builds a sorted, validated tree from unsorted input", () => {
  const result = constructFileTree([
    ["z.txt", bytesOf("z")],
    ["a.txt", bytesOf("a")],
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual([...result.value.keys()], ["a.txt", "z.txt"]);
  }
});

test("rejects an invalid tracked path", () => {
  const result = constructFileTree([["a\\b", bytesOf("x")]]);
  assert.equal(result.ok, false);
});

test("rejects a duplicate path", () => {
  const result = constructFileTree([
    ["a.txt", bytesOf("1")],
    ["a.txt", bytesOf("2")],
  ]);
  assert.equal(result.ok, false);
});

test("rejects a non-prefix-free tree: a file and a path nested under it", () => {
  const result = constructFileTree([
    ["a", bytesOf("file")],
    ["a/b", bytesOf("nested")],
  ]);
  assert.equal(result.ok, false);
});

test("rejects a non-prefix-free tree even when an intervening path sorts between them", () => {
  const result = constructFileTree([
    ["a", bytesOf("file")],
    ["a!x", bytesOf("between")],
    ["a/b", bytesOf("nested")],
  ]);
  assert.equal(result.ok, false);
});

test("accepts sibling paths that merely share a prefix string, not a path segment", () => {
  const result = constructFileTree([
    ["a", bytesOf("file")],
    ["ab", bytesOf("other")],
  ]);
  assert.equal(result.ok, true);
});

test("does not mutate the input entries array", () => {
  const entries: [string, Uint8Array][] = [
    ["z.txt", bytesOf("z")],
    ["a.txt", bytesOf("a")],
  ];
  const snapshot = entries.map(([path]) => path);
  constructFileTree(entries);
  assert.deepEqual(entries.map(([path]) => path), snapshot);
});
