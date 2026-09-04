import test from "node:test";
import assert from "node:assert/strict";
import { createVersion } from "../src/domain/version/construct.js";
import { formatVersion } from "../src/domain/version/format.js";
import { EMPTY_VERSION, MAX_REVISION } from "../src/domain/version/types.js";

test("createVersion canonicalizes (sorts) an unsorted but otherwise valid component list", () => {
  const result = createVersion([
    { contributorId: "b@x", revision: 1 },
    { contributorId: "a@x", revision: 1 },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(formatVersion(result.value), "(a@x->1,b@x->1)");
  }
});

test("createVersion rejects an invalid contributor id", () => {
  const result = createVersion([{ contributorId: "not-an-id", revision: 1 }]);
  assert.equal(result.ok, false);
});

test("createVersion rejects an out-of-range revision (zero, negative, non-integer, over max)", () => {
  assert.equal(createVersion([{ contributorId: "a@x", revision: 0 }]).ok, false);
  assert.equal(createVersion([{ contributorId: "a@x", revision: -1 }]).ok, false);
  assert.equal(createVersion([{ contributorId: "a@x", revision: 1.5 }]).ok, false);
  assert.equal(createVersion([{ contributorId: "a@x", revision: MAX_REVISION + 1 }]).ok, false);
  assert.equal(createVersion([{ contributorId: "a@x", revision: MAX_REVISION }]).ok, true);
});

test("createVersion rejects duplicate contributor ids", () => {
  const result = createVersion([
    { contributorId: "a@x", revision: 1 },
    { contributorId: "a@x", revision: 2 },
  ]);
  assert.equal(result.ok, false);
});

test("EMPTY_VERSION and createVersion results are immutable", () => {
  assert.equal(Object.isFrozen(EMPTY_VERSION), true);
  assert.equal(Object.isFrozen(EMPTY_VERSION.components), true);

  const result = createVersion([{ contributorId: "a@x", revision: 1 }]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.components), true);
    assert.equal(Object.isFrozen(result.value.components[0]), true);
  }
});
