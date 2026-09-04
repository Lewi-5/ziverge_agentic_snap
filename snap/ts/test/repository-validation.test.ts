import test from "node:test";
import assert from "node:assert/strict";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import { validateRepository } from "../src/domain/repository/validate.js";
import type { ValidatedRepository } from "../src/domain/repository/types.js";

function validate(value: unknown) {
  const decoded = decodeRepositoryDocument(value);
  if (!decoded.ok) return decoded;
  return validateRepository(decoded.value);
}

function requireValid(value: unknown): ValidatedRepository {
  const result = validate(value);
  if (!result.ok) throw new Error(result.error.detail);
  return result.value;
}

test("full validator accepts empty, linear, and branching causal histories", () => {
  requireValid({ format: 1, frontier: [], patches: [] });
  requireValid({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "base", changes: [{ type: "text", path: "f", edit: [{ insert: ["base\n"] }] }] },
      { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b", changes: [{ type: "text", path: "f", edit: [{ insert: ["b\n"] }, { retain: 1 }] }] },
      { author: "c@x", revision: 1, base: [["a@x", 1]], message: "c", changes: [{ type: "text", path: "f", edit: [{ insert: ["c\n"] }, { retain: 1 }] }] },
    ],
  });
});

test("full validator rejects gaps, unreachable extras, missing dependencies, and cycles", () => {
  const gap = validate({
    format: 1,
    frontier: [["a@x", 2]],
    patches: [{ author: "a@x", revision: 2, base: [["a@x", 1]], message: "gap", changes: [{ type: "text", path: "f", edit: [] }] }],
  });
  assert.equal(gap.ok, false);
  if (!gap.ok) assert.match(gap.error.detail, /missing a@x/);

  const unreachable = validate({
    format: 1,
    frontier: [],
    patches: [{ author: "a@x", revision: 1, base: [], message: "extra", changes: [{ type: "text", path: "f", edit: [] }] }],
  });
  assert.equal(unreachable.ok, false);
  if (!unreachable.ok) assert.match(unreachable.error.detail, /^unreachable patch:/);

  const missing = validate({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 1, base: [["b@x", 1]], message: "missing", changes: [{ type: "text", path: "f", edit: [] }] }],
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error.detail, /missing dependency/);

  const cycle = validate({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [["b@x", 1]], message: "a", changes: [{ type: "text", path: "a", edit: [] }] },
      { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b", changes: [{ type: "text", path: "b", edit: [] }] },
    ],
  });
  assert.equal(cycle.ok, false);
  if (!cycle.ok) assert.equal(cycle.error.detail, "cyclic or incomplete patch history");
});

test("exact-base semantics reject invalid creates, edits, deletes, no-ops, and prefix results", () => {
  const deleteAbsent = validate({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 1, base: [], message: "d", changes: [{ type: "delete", path: "f" }] }],
  });
  assert.equal(deleteAbsent.ok, false);
  if (!deleteAbsent.ok) assert.equal(deleteAbsent.error.detail, "delete of absent path: f");

  const noOp = validate({
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "p1", changes: [{ type: "put", path: "f", content: "YQ==" }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "p2", changes: [{ type: "put", path: "f", content: "YQ==" }] },
    ],
  });
  assert.equal(noOp.ok, false);
  if (!noOp.ok) assert.match(noOp.error.detail, /no-op change/);

  const prefix = validate({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{
      author: "a@x", revision: 1, base: [], message: "prefix",
      changes: [{ type: "put", path: "a", content: "YQ==" }, { type: "put", path: "a/b", content: "Yg==" }],
    }],
  });
  assert.equal(prefix.ok, false);
  if (!prefix.ok) assert.match(prefix.error.detail, /tree paths conflict/);

  const binaryText = validate({
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "binary", changes: [{ type: "put", path: "f", content: "AA==" }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "text", changes: [{ type: "text", path: "f", edit: [{ delete: 1 }] }] },
    ],
  });
  assert.equal(binaryText.ok, false);
});

test("empty text creation is the sole valid empty edit", () => {
  requireValid({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 1, base: [], message: "empty", changes: [{ type: "text", path: "f", edit: [] }] }],
  });
  const editPresent = validate({
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "empty", changes: [{ type: "text", path: "f", edit: [] }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "invalid", changes: [{ type: "text", path: "f", edit: [] }] },
    ],
  });
  assert.equal(editPresent.ok, false);
});

test("schema diagnostics expose strict layer failures", () => {
  const unknown = decodeRepositoryDocument({ format: 1, frontier: [], patches: [], unknown: true });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error.detail, "repository has unknown field: unknown");
  const emptyChanges = decodeRepositoryDocument({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 1, base: [], message: "x", changes: [] }],
  });
  assert.equal(emptyChanges.ok, false);
  if (!emptyChanges.ok) assert.match(emptyChanges.error.detail, /changes is empty/);
});
