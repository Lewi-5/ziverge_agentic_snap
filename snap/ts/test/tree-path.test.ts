import test from "node:test";
import assert from "node:assert/strict";
import { createTrackedPath, isPathOrDescendant } from "../src/domain/tree/path.js";

test("accepts an ordinary nested path", () => {
  const result = createTrackedPath("src/main.ts");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "src/main.ts");
  }
});

test("accepts a nested .snap directory that is not the first segment", () => {
  const result = createTrackedPath("docs/.snap/file");
  assert.equal(result.ok, true);
});

test("rejects an empty path", () => {
  const result = createTrackedPath("");
  assert.equal(result.ok, false);
});

test("rejects a backslash", () => {
  const result = createTrackedPath("a\\b");
  assert.equal(result.ok, false);
});

test("rejects an ASCII control character", () => {
  const result = createTrackedPath("a\tb");
  assert.equal(result.ok, false);
});

test("rejects an empty segment (leading, trailing, or doubled slash)", () => {
  assert.equal(createTrackedPath("/a").ok, false);
  assert.equal(createTrackedPath("a/").ok, false);
  assert.equal(createTrackedPath("a//b").ok, false);
});

test("rejects a '.' or '..' segment", () => {
  assert.equal(createTrackedPath("a/./b").ok, false);
  assert.equal(createTrackedPath("a/../b").ok, false);
  assert.equal(createTrackedPath(".").ok, false);
  assert.equal(createTrackedPath("..").ok, false);
});

test("rejects a first segment of exactly '.snap'", () => {
  assert.equal(createTrackedPath(".snap").ok, false);
  assert.equal(createTrackedPath(".snap/repository.json").ok, false);
});

test("preserves Unicode spelling exactly", () => {
  const result = createTrackedPath("é/😀");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "é/😀");
  }
});

test("isPathOrDescendant matches self and nested paths, not string-prefix false positives", () => {
  assert.equal(isPathOrDescendant("a", "a"), true);
  assert.equal(isPathOrDescendant("a/b", "a"), true);
  assert.equal(isPathOrDescendant("ab", "a"), false);
});
