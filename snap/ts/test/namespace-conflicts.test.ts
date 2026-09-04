import test from "node:test";
import assert from "node:assert/strict";
import { resolveNamespaceConflicts } from "../src/domain/tree/namespace-conflicts.js";

const encoder = new TextEncoder();

test("incoming ancestor removes all current descendants and deduplicates removals", () => {
  const current = new Map([
    ["a/b", encoder.encode("b")],
    ["a/c", encoder.encode("c")],
    ["z", encoder.encode("z")],
  ]);
  const incoming = encoder.encode("a");
  const result = resolveNamespaceConflicts(current, new Map([["a", incoming]]), new Set());
  assert.deepEqual([...result.settledIncomingPaths], ["a"]);
  assert.deepEqual([...result.removals], ["a/b", "a/c"]);
  assert.equal(result.installations.get("a"), incoming);
  assert.deepEqual(result.warnings, [
    { path: "a/b", reason: "namespace-wins" },
    { path: "a/c", reason: "namespace-wins" },
  ]);
});

test("incoming descendant removes a current ancestor", () => {
  const current = new Map([["a", encoder.encode("a")]]);
  const result = resolveNamespaceConflicts(current, new Map([["a/b", encoder.encode("b")]]), new Set());
  assert.deepEqual([...result.removals], ["a"]);
  assert.deepEqual(result.warnings, [{ path: "a", reason: "namespace-wins" }]);
});

test("authored deletions are removed before namespace collision detection", () => {
  const current = new Map([["a", encoder.encode("a")]]);
  const result = resolveNamespaceConflicts(current, new Map([["a/b", encoder.encode("b")]]), new Set(["a"]));
  assert.equal(result.settledIncomingPaths.size, 0);
  assert.equal(result.removals.size, 0);
  assert.deepEqual(result.warnings, []);
});

test("same path and unrelated paths are not namespace collisions", () => {
  const current = new Map([["a", encoder.encode("a")], ["ab/c", encoder.encode("c")]]);
  const result = resolveNamespaceConflicts(current, new Map([["a", encoder.encode("new")]]), new Set());
  assert.equal(result.settledIncomingPaths.size, 0);
});
