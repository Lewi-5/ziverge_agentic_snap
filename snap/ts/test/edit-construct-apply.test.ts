import test from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/domain/edit/apply.js";
import { coalesceOperations } from "../src/domain/edit/coalesce.js";
import { constructEdit } from "../src/domain/edit/construct.js";

test("constructs and applies a complete mixed edit without mutating inputs", () => {
  const base = Object.freeze(["a\n", "b\n", "c"]);
  const raw = [{ retain: 1 }, { delete: 1 }, { insert: ["B\n"] }, { retain: 1 }];
  const edit = constructEdit(raw, base);
  assert.equal(edit.ok, true);
  if (edit.ok) {
    const applied = applyEdit(base, edit.value);
    assert.equal(applied.ok, true);
    if (applied.ok) assert.deepEqual(applied.value, ["a\n", "B\n", "c"]);
    assert.notEqual(edit.value, raw);
  }
  assert.deepEqual(base, ["a\n", "b\n", "c"]);
});

test("allows only the empty-file creation exception for an empty script", () => {
  assert.equal(constructEdit([], null).ok, true);
  assert.equal(constructEdit([], []).ok, false);
  assert.equal(constructEdit([{ insert: ["x"] }], null).ok, true);
});

test("rejects malformed operation schemas and adjacent kinds", () => {
  const invalid: unknown[] = [
    {}, [{ retain: 1, delete: 1 }], [{ unknown: 1 }], [{ retain: 0 }], [{ retain: 1.5 }],
    [{ retain: Number.MAX_SAFE_INTEGER + 1 }], [{ delete: -1 }], [{ insert: [] }],
    [{ insert: [""] }], [{ insert: ["hello\0\n"] }], [{ retain: 1 }, { retain: 1 }], [{ insert: ["x"] }, { insert: ["y"] }],
  ];
  for (const value of invalid) assert.equal(constructEdit(value, []).ok, false, JSON.stringify(value));
});

test("distinguishes under- and over-consumption and rejects noncanonical/no-op results", () => {
  const under = constructEdit([{ retain: 1 }], ["a\n", "b\n"]);
  assert.equal(under.ok, false);
  if (!under.ok) {
    assert.match(under.error.detail, /under-consumes/);
    assert.match(under.error.detail, /does not consume old content/);
  }
  const over = constructEdit([{ delete: 2 }], ["a\n"]);
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.match(over.error.detail, /over-consumes/);
    assert.match(over.error.detail, /consumes beyond old content/);
  }
  assert.equal(constructEdit([{ retain: 1 }], ["a\n"]).ok, false);
  assert.equal(constructEdit([{ insert: ["unterminated"] }, { retain: 1 }], ["tail\n"]).ok, false);
});

test("matches exact acceptance test error patterns for schema and consumption failures", () => {
  const multiKey = constructEdit([{ retain: 1, delete: 1 }], ["a\n"]);
  assert.equal(multiKey.ok, false);
  if (!multiKey.ok) assert.match(multiKey.error.detail, /must have one operation/);

  const emptyInsert = constructEdit([{ insert: [] }], null);
  assert.equal(emptyInsert.ok, false);
  if (!emptyInsert.ok) assert.match(emptyInsert.error.detail, /insert is empty/);

  const nulInsert = constructEdit([{ insert: ["bad\0\n"] }], null);
  assert.equal(nulInsert.ok, false);
  if (!nulInsert.ok) assert.match(nulInsert.error.detail, /contains NUL byte/);
});

test("applyEdit handles large inputs without call stack overflow", () => {
  const count = 120000;
  const base: string[] = [];
  for (let i = 0; i < count; i += 1) base.push("line\n");
  const edit = [
    { retain: count },
    { insert: ["appended\n"] },
  ];
  const applied = applyEdit(base, edit);
  assert.equal(applied.ok, true);
  if (applied.ok) {
    assert.equal(applied.value.length, count + 1);
    assert.equal(applied.value[count], "appended\n");
  }
});

test("applyEdit defensively rejects unknown operation kinds", () => {
  const unknownOp = [{ custom: 42 }] as unknown as Parameters<typeof applyEdit>[1];
  const result = applyEdit(["a\n"], unknownOp);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.detail, /unknown edit operation kind/);
});

test("coalesces all operation kinds without mutating inputs", () => {
  const input = [{ retain: 1 }, { retain: 2 }, { delete: 1 }, { delete: 3 }, { insert: ["x\n"] }, { insert: ["y"] }] as const;
  assert.deepEqual(coalesceOperations(input), [{ retain: 3 }, { delete: 4 }, { insert: ["x\n", "y"] }]);
  assert.deepEqual(input[0], { retain: 1 });
});

