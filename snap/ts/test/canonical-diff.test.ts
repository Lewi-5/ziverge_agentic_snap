import test from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/domain/edit/apply.js";
import { canonicalDiff } from "../src/domain/edit/canonical-diff.js";

test("repeated-line golden follows delete-on-tie canonical walk", () => {
  assert.deepEqual(canonicalDiff(["a\n", "b\n", "a\n"], ["b\n", "a\n", "a\n"]), [
    { delete: 1 }, { retain: 2 }, { insert: ["a\n"] },
  ]);
});

test("insert/delete tie chooses deletion at the first differing cursor", () => {
  assert.deepEqual(canonicalDiff(["a\n"], ["b\n"]), [{ delete: 1 }, { insert: ["b\n"] }]);
});

test("canonical edge-case goldens", () => {
  assert.deepEqual(canonicalDiff([], []), []);
  assert.deepEqual(canonicalDiff([], ["x"]), [{ insert: ["x"] }]);
  assert.deepEqual(canonicalDiff(["x"], []), [{ delete: 1 }]);
  assert.deepEqual(canonicalDiff(["a\r\n", "é"], ["a\r\n", "😀"]), [{ retain: 1 }, { delete: 1 }, { insert: ["😀"] }]);
  assert.deepEqual(canonicalDiff(["x\n", "x\n"], ["x\n", "x\n"]), [{ retain: 2 }]);
});

function sequences(alphabet: readonly string[], maximumLength: number): readonly (readonly string[])[] {
  const output: string[][] = [[]];
  for (let length = 1; length <= maximumLength; length += 1) {
    const prior = output.filter((item) => item.length === length - 1);
    for (const prefix of prior) for (const token of alphabet) output.push([...prefix, token]);
  }
  return output;
}

function referenceDistance(a: readonly string[], b: readonly string[], i = 0, j = 0): number {
  if (i === a.length) return b.length - j;
  if (j === b.length) return a.length - i;
  if (a[i] === b[j]) return referenceDistance(a, b, i + 1, j + 1);
  return 1 + Math.min(referenceDistance(a, b, i + 1, j), referenceDistance(a, b, i, j + 1));
}

test("exhaustive short corpus is minimal, complete, coalesced, and round trips", () => {
  const corpus = sequences(["a\n", "b\n"], 3);
  for (const oldTokens of corpus) for (const newTokens of corpus) {
    const edit = canonicalDiff(oldTokens, newTokens);
    const cost = edit.reduce((sum, operation) => sum + ("retain" in operation ? 0 : "delete" in operation ? operation.delete : operation.insert.length), 0);
    assert.equal(cost, referenceDistance(oldTokens, newTokens));
    for (let index = 1; index < edit.length; index += 1) {
      assert.notEqual(Object.keys(edit[index - 1] ?? {})[0], Object.keys(edit[index] ?? {})[0]);
    }
    const applied = applyEdit(oldTokens, edit);
    assert.equal(applied.ok, true);
    if (applied.ok) assert.deepEqual(applied.value, newTokens);
  }
});

