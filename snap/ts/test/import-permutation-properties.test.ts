import test from "node:test";
import assert from "node:assert/strict";
import { materializeVersion } from "../src/domain/history/materialize.js";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import { unionRepositoryDocuments } from "../src/domain/repository/union.js";
import type { RepositoryDocument, ValidatedRepository } from "../src/domain/repository/types.js";
import { validateRepository } from "../src/domain/repository/validate.js";

/**
 * Property tests for SPEC §11.6/§11.11: patch/import permutations must
 * preserve the joined frontier, patch set, replayed bytes, and warning set,
 * regardless of union direction or internal patch-array storage order.
 *
 * `replay-convergence.test.ts` already proves single-repository storage-order
 * independence; this file exercises the two-repository union case that
 * `merge` actually performs.
 */

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

function sortedFrontier(components: readonly (readonly [string, number])[]): readonly (readonly [string, number])[] {
  return [...components].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function sortedPatchInputs<T extends { readonly author: string; readonly revision: number }>(patches: readonly T[]): readonly T[] {
  return [...patches].sort((left, right) => {
    if (left.author < right.author) return -1;
    if (left.author > right.author) return 1;
    return left.revision - right.revision;
  });
}

function decodeValidated(source: unknown): ValidatedRepository {
  const decoded = decodeRepositoryDocument(source);
  if (!decoded.ok) throw new Error(decoded.error.detail);
  const validated = validateRepository(decoded.value);
  if (!validated.ok) throw new Error(validated.error.detail);
  return validated.value;
}

function assumeValidated(document: RepositoryDocument): ValidatedRepository {
  return { document } as unknown as ValidatedRepository;
}

const ROOT_PATCH = Object.freeze({
  author: "root@x",
  revision: 1,
  base: [],
  message: "base",
  changes: [{ type: "text", path: "f", edit: [{ insert: ["zero\n", "one\n", "two\n", "three\n"] }] }],
});

/** Two branches diverging from a shared common-ancestor patch, each with its own contributors. */
function branchFrom(seed: number, authors: readonly string[]): RepositoryDocument {
  const patches = [
    ROOT_PATCH,
    ...authors.map((author, index) => ({
      author,
      revision: 1,
      base: [["root@x", 1]],
      message: author,
      changes: [{ type: "text", path: "f", edit: editFor(seed + index, author) }],
    })),
  ];
  const source = {
    format: 1,
    frontier: sortedFrontier([["root@x", 1], ...authors.map((author): [string, number] => [author, 1])]),
    patches: sortedPatchInputs(patches),
  };
  return decodeValidated(source).document;
}

/** An insert-only edit against an empty base, for paths that do not yet exist. */
function insertOnlyEdit(seed: number, author: string): readonly Readonly<Record<string, unknown>>[] {
  return [{ insert: [`${author}-${String(seed)}\n`] }];
}

/** Two fully independent histories: disjoint contributors, no shared ancestor at all. */
function disjointHistory(seed: number, authors: readonly string[]): RepositoryDocument {
  const patches = authors.map((author, index) => ({
    author,
    revision: 1,
    base: [],
    message: author,
    changes: [{ type: "text", path: `${author}.txt`, edit: insertOnlyEdit(seed + index, author) }],
  }));
  const source = {
    format: 1,
    frontier: sortedFrontier(authors.map((author): [string, number] => [author, 1])),
    patches,
  };
  return decodeValidated(source).document;
}

/** One concurrent atomic creation, used to exercise whole-file warnings as well as bytes. */
function atomicHistory(author: string, byte: number): RepositoryDocument {
  return decodeValidated({
    format: 1,
    frontier: [[author, 1]],
    patches: [
      {
        author,
        revision: 1,
        base: [],
        message: author,
        changes: [{ type: "put", path: "conflict.bin", content: Buffer.from([byte]).toString("base64") }],
      },
    ],
  }).document;
}

interface UnionSnapshot {
  readonly patchIds: readonly string[];
  readonly frontier: readonly (readonly [string, number])[];
  readonly tree: readonly (readonly [string, readonly number[]])[];
  readonly warnings: readonly (readonly [string, string])[];
}

function snapshot(document: RepositoryDocument): UnionSnapshot {
  const validated = assumeValidated(document);
  const materialized = materializeVersion(validated, document.frontier);
  if (!materialized.ok) throw new Error(materialized.error.detail);
  return {
    patchIds: [...document.patches].map((patch) => `${patch.author}:${String(patch.revision)}`).sort(),
    frontier: [...document.frontier.components]
      .map((component) => [component.contributorId, component.revision] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    tree: [...materialized.value.tree].map(([path, bytes]) => [path, [...bytes]] as const),
    warnings: materialized.value.warnings.map((fact) => [fact.path, fact.reason] as const),
  };
}

function unionOf(left: RepositoryDocument, right: RepositoryDocument): RepositoryDocument {
  const union = unionRepositoryDocuments(left, right);
  if (!union.ok) throw new Error(union.error.detail);
  return union.value;
}

function withShuffledPatches(document: RepositoryDocument, seed: number): RepositoryDocument {
  return { ...document, patches: shuffled(document.patches, seed) };
}

function describeFailure(seed: number, left: RepositoryDocument, right: RepositoryDocument): string {
  return `seed=${String(seed)}\nleft=${JSON.stringify(left.patches)}\nright=${JSON.stringify(right.patches)}`;
}

const SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);

test("shared-ancestor union converges regardless of direction or storage-array order", () => {
  for (const seed of SEEDS) {
    const left = branchFrom(seed, ["L1@x", "L2@x"]);
    const right = branchFrom(seed * 7, ["R1@x", "R2@x"]);

    const forward = snapshot(unionOf(left, right));
    const backward = snapshot(unionOf(right, left));

    try {
      assert.deepEqual(backward, forward);

      for (let permutation = 0; permutation < 4; permutation += 1) {
        const shuffledLeft = withShuffledPatches(left, seed * 31 + permutation);
        const shuffledRight = withShuffledPatches(right, seed * 37 + permutation);
        const shuffledSnapshot = snapshot(unionOf(shuffledLeft, shuffledRight));
        assert.deepEqual(shuffledSnapshot, forward);
      }
    } catch (error) {
      throw new Error(`${describeFailure(seed, left, right)}\n${(error as Error).message}`);
    }
  }
});

test("disjoint-history union converges regardless of direction or storage-array order", () => {
  for (const seed of SEEDS) {
    const left = disjointHistory(seed, ["A@x", "B@x"]);
    const right = disjointHistory(seed * 11, ["C@x", "D@x"]);

    const forward = snapshot(unionOf(left, right));
    const backward = snapshot(unionOf(right, left));

    try {
      assert.deepEqual(backward, forward);

      for (let permutation = 0; permutation < 4; permutation += 1) {
        const shuffledLeft = withShuffledPatches(left, seed * 41 + permutation);
        const shuffledRight = withShuffledPatches(right, seed * 43 + permutation);
        const shuffledSnapshot = snapshot(unionOf(shuffledLeft, shuffledRight));
        assert.deepEqual(shuffledSnapshot, forward);
      }
    } catch (error) {
      throw new Error(`${describeFailure(seed, left, right)}\n${(error as Error).message}`);
    }
  }
});

test("repeated union is idempotent: union(union(A, B), B) equals union(A, B)", () => {
  for (const seed of SEEDS) {
    const left = branchFrom(seed, ["L1@x", "L2@x"]);
    const right = branchFrom(seed * 7, ["R1@x", "R2@x"]);

    const once = unionOf(left, right);
    const twice = unionOf(once, right);

    try {
      assert.deepEqual(snapshot(twice), snapshot(once));
    } catch (error) {
      throw new Error(`${describeFailure(seed, left, right)}\n${(error as Error).message}`);
    }
  }
});

test("three-way union is associative and preserves nonempty warning facts", () => {
  for (const seed of SEEDS) {
    const first = atomicHistory("A@x", seed);
    const second = atomicHistory("B@x", seed + 32);
    const third = atomicHistory("C@x", seed + 64);

    const leftAssociated = snapshot(unionOf(unionOf(first, second), third));
    const rightAssociated = snapshot(unionOf(first, unionOf(second, third)));

    try {
      assert.deepEqual(rightAssociated, leftAssociated);
      assert.ok(leftAssociated.warnings.length > 0, "fixture must exercise warning-set convergence");

      const permuted = snapshot(
        unionOf(
          withShuffledPatches(third, seed * 47),
          unionOf(withShuffledPatches(first, seed * 53), withShuffledPatches(second, seed * 59)),
        ),
      );
      assert.deepEqual(permuted, leftAssociated);
    } catch (error) {
      throw new Error(
        `seed=${String(seed)}\nfirst=${JSON.stringify(first.patches)}\nsecond=${JSON.stringify(second.patches)}\nthird=${JSON.stringify(third.patches)}\n${(error as Error).message}`,
      );
    }
  }
});
