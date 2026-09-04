import test from "node:test";
import assert from "node:assert/strict";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import { validateLinearRepository } from "../src/domain/repository/linear-history.js";
import { serializeRepositoryDocument } from "../src/domain/repository/serialize.js";
import { encodeBase64 } from "../src/domain/content/base64.js";

function decodeAndValidate(value: unknown) {
  const decoded = decodeRepositoryDocument(value);
  if (!decoded.ok) {
    return decoded;
  }
  return validateLinearRepository(decoded.value);
}

test("decodes and validates the empty repository", () => {
  const result = decodeAndValidate({ format: 1, frontier: [], patches: [] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.document.patches.length, 0);
  }
});

test("round-trips a single text-create patch through serialize -> decode -> validate", () => {
  const source = {
    format: 1,
    frontier: [["alice@example.com", 1]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "add greeting",
        changes: [{ type: "text", path: "hello.txt", edit: [{ insert: ["hello\n"] }] }],
      },
    ],
  };
  const validated = decodeAndValidate(source);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const reencoded = JSON.parse(serializeRepositoryDocument(validated.value.document)) as unknown;
  assert.deepEqual(reencoded, source);
});

test("round-trips a two-patch chain: text edit and a put binary change", () => {
  const binary = new Uint8Array([0, 255, 1]);
  const source = {
    format: 1,
    frontier: [["alice@example.com", 2]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "create",
        changes: [{ type: "text", path: "a.txt", edit: [{ insert: ["a\n", "b\n"] }] }],
      },
      {
        author: "alice@example.com",
        revision: 2,
        base: [["alice@example.com", 1]],
        message: "edit and add binary",
        changes: [
          { type: "text", path: "a.txt", edit: [{ retain: 1 }, { delete: 1 }, { insert: ["c\n"] }] },
          { type: "put", path: "data.bin", content: encodeBase64(binary) },
        ],
      },
    ],
  };
  const validated = decodeAndValidate(source);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const reencoded = JSON.parse(serializeRepositoryDocument(validated.value.document)) as unknown;
  assert.deepEqual(reencoded, source);
});

test("handles a multi-author serial chain (b commits after a, in the same repository)", () => {
  const source = {
    format: 1,
    frontier: [["alice@example.com", 1], ["bob@example.com", 1]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "alice creates",
        changes: [{ type: "text", path: "a.txt", edit: [{ insert: ["a\n"] }] }],
      },
      {
        author: "bob@example.com",
        revision: 1,
        base: [["alice@example.com", 1]],
        message: "bob creates",
        changes: [{ type: "text", path: "b.txt", edit: [{ insert: ["b\n"] }] }],
      },
    ],
  };
  const validated = decodeAndValidate(source);
  assert.equal(validated.ok, true);
});

test("rejects an unknown top-level field", () => {
  const result = decodeRepositoryDocument({ format: 1, frontier: [], patches: [], extra: true });
  assert.equal(result.ok, false);
});

test("rejects a non-canonically-ordered frontier", () => {
  const result = decodeRepositoryDocument({
    format: 1,
    frontier: [["bob@example.com", 1], ["alice@example.com", 1]],
    patches: [],
  });
  assert.equal(result.ok, false);
});

test("rejects more than one change for the same path in one patch", () => {
  const result = decodeRepositoryDocument({
    format: 1,
    frontier: [["alice@example.com", 1]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "m",
        changes: [
          { type: "text", path: "a.txt", edit: [{ insert: ["a\n"] }] },
          { type: "delete", path: "a.txt" },
        ],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("accepts concurrent patches that share the same base through the M5 validator", () => {
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 1], ["bob@example.com", 1]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "a",
        changes: [{ type: "text", path: "a.txt", edit: [{ insert: ["a\n"] }] }],
      },
      {
        author: "bob@example.com",
        revision: 1,
        base: [],
        message: "b",
        changes: [{ type: "text", path: "b.txt", edit: [{ insert: ["b\n"] }] }],
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("rejects a revision that does not equal base[author] + 1", () => {
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 3]],
    patches: [
      {
        author: "alice@example.com",
        revision: 3,
        base: [],
        message: "m",
        changes: [{ type: "text", path: "a.txt", edit: [{ insert: ["a\n"] }] }],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("rejects a delete of a path absent from its materialized base", () => {
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 1]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "m",
        changes: [{ type: "delete", path: "missing.txt" }],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("rejects a put that does not alter existing bytes", () => {
  const bytes = encodeBase64(new Uint8Array([1, 2, 3]));
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 2]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "create",
        changes: [{ type: "put", path: "d.bin", content: bytes }],
      },
      {
        author: "alice@example.com",
        revision: 2,
        base: [["alice@example.com", 1]],
        message: "no-op put",
        changes: [{ type: "put", path: "d.bin", content: bytes }],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("rejects a frontier that does not match the materialized chain", () => {
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 2]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "m",
        changes: [{ type: "text", path: "a.txt", edit: [{ insert: ["a\n"] }] }],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("rejects a text edit against a binary base", () => {
  const result = decodeAndValidate({
    format: 1,
    frontier: [["alice@example.com", 2]],
    patches: [
      {
        author: "alice@example.com",
        revision: 1,
        base: [],
        message: "m",
        changes: [{ type: "put", path: "a", content: encodeBase64(new Uint8Array([0, 1, 2])) }],
      },
      {
        author: "alice@example.com",
        revision: 2,
        base: [["alice@example.com", 1]],
        message: "m2",
        changes: [{ type: "text", path: "a", edit: [{ insert: ["x\n"] }] }],
      },
    ],
  });
  assert.equal(result.ok, false);
});
