import test from "node:test";
import assert from "node:assert/strict";
import type { Change } from "../src/domain/repository/types.js";
import { resolvePathConflict } from "../src/domain/tree/path-conflicts.js";

const encoder = new TextEncoder();
const old = encoder.encode("old\n");
const current = encoder.encode("current\n");
const authored = encoder.encode("authored\n");
const text: Change = { type: "text", path: "p", edit: [{ retain: 1 }] };
const put: Change = { type: "put", path: "p", content: "" };
const remove: Change = { type: "delete", path: "p" };

test("whole-path rule 1 keeps identical current/authored content without warning", () => {
  const result = resolvePathConflict("p", old, authored, authored, put);
  assert.equal(result.content, authored);
  assert.equal(result.warning, undefined);
});

test("whole-path rule 2 makes incoming delete win", () => {
  const result = resolvePathConflict("p", old, current, undefined, remove);
  assert.equal(result.content, undefined);
  assert.deepEqual(result.warning, { path: "p", reason: "delete-wins" });
});

test("whole-path rule 3 preserves an earlier concurrent delete", () => {
  const result = resolvePathConflict("p", old, undefined, authored, text);
  assert.equal(result.content, undefined);
  assert.deepEqual(result.warning, { path: "p", reason: "delete-wins" });
});

test("whole-path rule 4 makes the canonically later concurrent create win", () => {
  const result = resolvePathConflict("p", undefined, current, authored, text);
  assert.equal(result.content, authored);
  assert.deepEqual(result.warning, { path: "p", reason: "later-create-wins" });
});

test("whole-path rule 5 makes incoming put replacement win", () => {
  const result = resolvePathConflict("p", old, current, authored, put);
  assert.equal(result.content, authored);
  assert.deepEqual(result.warning, { path: "p", reason: "later-put-wins" });
});

test("whole-path rule 6 preserves incompatible current non-text content", () => {
  const result = resolvePathConflict("p", old, current, authored, text);
  assert.equal(result.content, current);
  assert.deepEqual(result.warning, { path: "p", reason: "put-wins" });
});

test("identical rule has precedence over put winner warning", () => {
  const result = resolvePathConflict("p", old, current, current, put);
  assert.equal(result.warning, undefined);
});
