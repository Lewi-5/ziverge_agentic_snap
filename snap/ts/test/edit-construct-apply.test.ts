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
    [{ insert: [""] }], [{ retain: 1 }, { retain: 1 }], [{ insert: ["x"] }, { insert: ["y"] }],
  ];
  for (const value of invalid) assert.equal(constructEdit(value, []).ok, false, JSON.stringify(value));
});

test("distinguishes under- and over-consumption and rejects noncanonical/no-op results", () => {
  const under = constructEdit([{ retain: 1 }], ["a\n", "b\n"]);
  assert.equal(under.ok, false);
  if (!under.ok) assert.match(under.error.detail, /under-consumes/);
  const over = constructEdit([{ delete: 2 }], ["a\n"]);
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.error.detail, /over-consumes/);
  assert.equal(constructEdit([{ retain: 1 }], ["a\n"]).ok, false);
  assert.equal(constructEdit([{ insert: ["unterminated"] }, { retain: 1 }], ["tail\n"]).ok, false);
});

test("coalesces all operation kinds without mutating inputs", () => {
  const input = [{ retain: 1 }, { retain: 2 }, { delete: 1 }, { delete: 3 }, { insert: ["x\n"] }, { insert: ["y"] }] as const;
  assert.deepEqual(coalesceOperations(input), [{ retain: 3 }, { delete: 4 }, { insert: ["x\n", "y"] }]);
  assert.deepEqual(input[0], { retain: 1 });
});

