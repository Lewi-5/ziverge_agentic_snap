import test from "node:test";
import assert from "node:assert/strict";
import { materializeVersion } from "../src/domain/history/materialize.js";
import { patchResult } from "../src/domain/history/patch-result.js";
import { schedulePatches } from "../src/domain/history/ready-scheduler.js";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import type { Patch, RepositoryDocument, ValidatedRepository } from "../src/domain/repository/types.js";
import { validateRepository } from "../src/domain/repository/validate.js";

function editFor(seed: number, author: string): readonly Readonly<Record<string, unknown>>[] {
  const position = seed % 5;
  if ((seed & 1) === 0) {
    const operations: Readonly<Record<string, unknown>>[] = [];
    if (position > 0) operations.push({ retain: position });
    operations.push({ insert: [`${author}-${String(seed)}\n`] });
    if (position < 4) operations.push({ retain: 4 - position });
    return operations;
  }
  const deleted = seed % 4;
  const operations: Readonly<Record<string, unknown>>[] = [];
  if (deleted > 0) operations.push({ retain: deleted });
  operations.push({ delete: 1 });
  if (deleted < 3) operations.push({ retain: 3 - deleted });
  return operations;
}

function shuffled<T>(values: readonly T[], seed: number): readonly T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const other = state % (index + 1);
    const value = result[index];
    const replacement = result[other];
    if (value !== undefined && replacement !== undefined) {
      result[index] = replacement;
      result[other] = value;
    }
  }
  return result;
}

function assumeValidated(document: RepositoryDocument): ValidatedRepository {
  return { document } as unknown as ValidatedRepository;
}

function treeSnapshot(repository: ValidatedRepository): readonly (readonly [string, readonly number[]])[] {
  const result = materializeVersion(repository, repository.document.frontier);
  if (!result.ok) throw new Error(result.error.detail);
  return [...result.value.tree].map(([path, bytes]) => [path, [...bytes]] as const);
}

function validatedPatches(seed: number): ValidatedRepository {
  const authors = ["b@x", "c@x", "d@x"];
  const source = {
    format: 1,
    frontier: [["a@x", 1], ...authors.map((author) => [author, 1])],
    patches: [
      {
        author: "a@x", revision: 1, base: [], message: "base",
        changes: [{ type: "text", path: "f", edit: [{ insert: ["zero\n", "one\n", "two\n", "three\n"] }] }],
      },
      ...authors.map((author, index) => ({
        author,
        revision: 1,
        base: [["a@x", 1]],
        message: author,
        changes: [{ type: "text", path: "f", edit: editFor(seed + index, author) }],
      })),
    ],
  };
  const decoded = decodeRepositoryDocument(source);
  if (!decoded.ok) throw new Error(decoded.error.detail);
  const validated = validateRepository(decoded.value);
  if (!validated.ok) throw new Error(validated.error.detail);
  return validated.value;
}

test("seeded causal text graphs converge across storage permutations", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const repository = validatedPatches(seed);
    const expectedTree = treeSnapshot(repository);
    const expectedOrder = schedulePatches(repository.document.patches);
    assert.equal(expectedOrder.ok, true);
    for (let permutation = 0; permutation < 8; permutation += 1) {
      const permuted: RepositoryDocument = {
        ...repository.document,
        patches: shuffled(repository.document.patches, seed * 31 + permutation),
      };
      // White-box property test: deliberately bypass canonical storage-order
      // validation to prove replay itself is permutation-independent.
      assert.deepEqual(treeSnapshot(assumeValidated(permuted)), expectedTree);
      const order = schedulePatches(permuted.patches);
      assert.equal(order.ok, true);
      if (order.ok && expectedOrder.ok) {
        assert.deepEqual(
          order.value.map((patch) => `${patch.author}:${String(patch.revision)}`),
          expectedOrder.value.map((patch) => `${patch.author}:${String(patch.revision)}`),
        );
      }
    }
  }
});

test("every patch result materializes its complete causal closure", () => {
  const repository = validatedPatches(17);
  for (const patch of repository.document.patches) {
    const resultVersion = patchResult(patch);
    assert.equal(resultVersion.ok, true);
    if (!resultVersion.ok) continue;
    const result = materializeVersion(repository, resultVersion.value);
    assert.equal(result.ok, true);
    if (result.ok && patch.author !== "a@x") assert.equal(result.value.tree.has("f"), true);
  }
});

test("typed patch inputs are not mutated by scheduling or materialization", () => {
  const repository = validatedPatches(9);
  const before = JSON.stringify(repository.document.patches);
  schedulePatches(repository.document.patches);
  materializeVersion(repository, repository.document.frontier);
  assert.equal(JSON.stringify(repository.document.patches), before);
});

function patchIdentity(patch: Patch): string {
  return `${patch.author}:${String(patch.revision)}`;
}

test("seed corpus exercises all generated concurrent patch identities", () => {
  const repository = validatedPatches(3);
  assert.deepEqual(repository.document.patches.map(patchIdentity), ["a@x:1", "b@x:1", "c@x:1", "d@x:1"]);
});
