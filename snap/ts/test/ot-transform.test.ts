import test from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/domain/edit/apply.js";
import type { EditScript } from "../src/domain/edit/types.js";
import { transformEdit } from "../src/domain/ot/transform.js";

function transformed(incoming: EditScript, context: EditScript): EditScript {
  const result = transformEdit(incoming, context);
  if (!result.ok) throw new Error(result.error.detail);
  return result.value;
}

test("OT handles every stream-pair matrix row", () => {
  assert.deepEqual(transformed([{ retain: 2 }], [{ insert: ["q\n"] }, { retain: 2 }]), [{ retain: 3 }]);
  assert.deepEqual(transformed([{ insert: ["p\n"] }, { retain: 2 }], [{ retain: 2 }]), [{ insert: ["p\n"] }, { retain: 2 }]);
  assert.deepEqual(transformed([{ delete: 2 }], [{ retain: 2 }]), [{ delete: 2 }]);
  assert.deepEqual(transformed([{ retain: 2 }], [{ delete: 2 }]), []);
  assert.deepEqual(transformed([{ delete: 2 }], [{ delete: 2 }]), []);
});

test("OT splits unequal retain and delete counts in both directions", () => {
  assert.deepEqual(
    transformed([{ retain: 5 }, { delete: 2 }], [{ retain: 2 }, { delete: 2 }, { retain: 3 }]),
    [{ retain: 3 }, { delete: 2 }],
  );
  assert.deepEqual(
    transformed([{ delete: 2 }, { retain: 5 }], [{ retain: 5 }, { delete: 2 }]),
    [{ delete: 2 }, { retain: 3 }],
  );
});

test("context insert wins priority over incoming insert at one cursor", () => {
  const script = transformed(
    [{ insert: ["incoming\n"] }, { retain: 1 }],
    [{ insert: ["context\n"] }, { retain: 1 }],
  );
  assert.deepEqual(script, [{ retain: 1 }, { insert: ["incoming\n"] }, { retain: 1 }]);
  const applied = applyEdit(["context\n", "base\n"], script);
  assert.equal(applied.ok, true);
  if (applied.ok) assert.deepEqual(applied.value, ["context\n", "incoming\n", "base\n"]);
});

test("context insert survives an incoming delete and trailing inserts are preserved", () => {
  assert.deepEqual(
    transformed([{ delete: 1 }, { insert: ["p-tail"] }], [{ insert: ["q\n"] }, { retain: 1 }, { insert: ["q-tail"] }]),
    [{ retain: 1 }, { delete: 1 }, { retain: 1 }, { insert: ["p-tail"] }],
  );
});

test("OT coalesces adjacent output created by stream splitting", () => {
  assert.deepEqual(
    transformed([{ retain: 3 }], [{ retain: 1 }, { insert: ["x\n"] }, { retain: 2 }]),
    [{ retain: 4 }],
  );
});

test("OT rejects unmatched base-consuming tails", () => {
  assert.equal(transformEdit([{ retain: 2 }], [{ retain: 1 }]).ok, false);
  assert.equal(transformEdit([{ retain: 1 }], [{ retain: 2 }]).ok, false);
});

test("OT does not mutate either input script", () => {
  const incoming: EditScript = Object.freeze([{ retain: 1 }, { insert: Object.freeze(["p\n"]) }]);
  const context: EditScript = Object.freeze([{ retain: 1 }, { insert: Object.freeze(["q\n"]) }]);
  const incomingBefore = structuredClone(incoming);
  const contextBefore = structuredClone(context);
  transformed(incoming, context);
  assert.deepEqual(incoming, incomingBefore);
  assert.deepEqual(context, contextBefore);
});
