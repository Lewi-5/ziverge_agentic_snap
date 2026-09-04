import test from "node:test";
import assert from "node:assert/strict";
import { validateConfiguration } from "../src/domain/config/schema.js";
import { serializeConfiguration } from "../src/domain/config/serialize.js";
import { parseJsonStrict } from "../src/domain/json/parse-json-strict.js";

test("accepts the exact supported shape", () => {
  const result = validateConfiguration({ contributor: { id: "alice@example.com" } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.contributor.id, "alice@example.com");
  }
});

test("rejects a non-object root", () => {
  for (const value of ["x", ["a"], null, 42, true]) {
    assert.equal(validateConfiguration(value).ok, false);
  }
});

test("rejects a missing contributor key", () => {
  const result = validateConfiguration({});
  assert.equal(result.ok, false);
});

test("rejects an unknown root-level field", () => {
  const result = validateConfiguration({ contributor: { id: "a@x" }, unknown: true });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "unknown field in configuration: unknown");
  }
});

test("rejects a non-object contributor value", () => {
  assert.equal(validateConfiguration({ contributor: "a@x" }).ok, false);
});

test("rejects a missing id inside contributor", () => {
  assert.equal(validateConfiguration({ contributor: {} }).ok, false);
});

test("rejects an unknown field inside contributor", () => {
  const result = validateConfiguration({ contributor: { id: "a@x", name: "Alice" } });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "unknown field in configuration: name");
  }
});

test("rejects a non-string id", () => {
  assert.equal(validateConfiguration({ contributor: { id: 42 } }).ok, false);
});

test("rejects invalid contributor id shapes and accepts the 254-byte boundary", () => {
  for (const id of ["bad-id", "two@@x", "café@x", " a@x", "a,b@x", "a(b@x", "a)b@x", "a->b@x"]) {
    const result = validateConfiguration({ contributor: { id } });
    assert.equal(result.ok, false, `expected '${id}' to be rejected`);
  }
  const idOfLength = (totalBytes: number): string => `${"a".repeat(totalBytes - 2)}@x`;
  assert.equal(validateConfiguration({ contributor: { id: idOfLength(254) } }).ok, true);
  assert.equal(validateConfiguration({ contributor: { id: idOfLength(255) } }).ok, false);
});

test("preserves contributor id spelling exactly", () => {
  const result = validateConfiguration({ contributor: { id: "Alice@Example.COM" } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.contributor.id, "Alice@Example.COM");
  }
});

test("serializeConfiguration uses two-space indentation and a trailing LF", () => {
  const result = validateConfiguration({ contributor: { id: "alice@example.com" } });
  assert.equal(result.ok, true);
  if (result.ok) {
    const text = serializeConfiguration(result.value);
    assert.equal(text, '{\n  "contributor": {\n    "id": "alice@example.com"\n  }\n}\n');
  }
});

test("serializeConfiguration round-trips through parseJsonStrict and validateConfiguration", () => {
  const original = validateConfiguration({ contributor: { id: "alice@example.com" } });
  assert.equal(original.ok, true);
  if (!original.ok) {
    return;
  }
  const parsed = parseJsonStrict(serializeConfiguration(original.value));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const revalidated = validateConfiguration(parsed.value);
  assert.equal(revalidated.ok, true);
  if (revalidated.ok) {
    assert.deepEqual(revalidated.value, original.value);
  }
});
