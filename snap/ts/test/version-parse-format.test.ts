import test from "node:test";
import assert from "node:assert/strict";
import { parseVersion } from "../src/domain/version/parse.js";
import { formatVersion } from "../src/domain/version/format.js";
import { EMPTY_VERSION, MAX_REVISION } from "../src/domain/version/types.js";

function expectOk(text: string): void {
  const result = parseVersion(text);
  assert.equal(result.ok, true, `expected '${text}' to parse successfully`);
}

function expectError(text: string): void {
  const result = parseVersion(text);
  assert.equal(result.ok, false, `expected '${text}' to be rejected`);
}

test("round trip: format(parse(x)) === x", () => {
  for (const text of ["()", "(a@x->1)", "(a@x->1,b@x->2)"]) {
    const result = parseVersion(text);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(formatVersion(result.value), text);
    }
  }
});

test("parse(format(v)) reconstructs v", () => {
  const version = { components: [{ contributorId: "a@x", revision: 1 }] };
  const result = parseVersion(formatVersion(version));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, version);
  }
});

test("empty version", () => {
  const result = parseVersion("()");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, EMPTY_VERSION);
  }
});

test("revision boundary: max safe integer is valid, one past it overflows", () => {
  expectOk(`(a@x->${String(MAX_REVISION)})`);
  expectError(`(a@x->${String(MAX_REVISION + 1)})`);
  expectError("(a@x->99999999999999999999)");
});

test("rejects duplicate contributor id", () => {
  const result = parseVersion("(a@x->1,a@x->2)");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "duplicate contributor id 'a@x'");
  }
});

test("rejects explicit zero revision", () => {
  expectError("(a@x->0)");
});

test("rejects leading zero in revision", () => {
  expectError("(a@x->007)");
});

test("rejects invalid contributor id shapes", () => {
  expectError("(noat->1)");
  expectError("(a@b@x->1)");
  expectError("(@x->1)");
  expectError("(a@->1)");
  expectError("(a\tb@x->1)");
  expectError("(a,b@x->1)");
  expectError("(a(b@x->1)");
  expectError("(a)b@x->1)");
  expectError("(a->b@x->1)");
  expectError(`(${"a".repeat(300)}@x->1)`);
});

test("rejects embedded whitespace anywhere in the version string", () => {
  expectError("(a@x ->1)");
  expectError(" (a@x->1)");
  expectError("(a@x->1) ");
});

test("rejects noncanonical component order", () => {
  expectError("(b@x->1,a@x->1)");
});

test("rejects malformed syntax", () => {
  expectError("a@x->1");
  expectError("(a@x->1,)");
  expectError("()extra");
  expectError("(a@x)");
});

test("rejects non-ASCII contributor ids", () => {
  expectError("(café@x->1)"); // "café@x"
  expectError("(a@xé->1)");
});

test("contributor id byte-length boundary: 254 bytes accepted, 255 rejected", () => {
  const idOfLength = (totalBytes: number): string => `${"a".repeat(totalBytes - 2)}@x`; // "@x" is 2 bytes
  expectOk(`(${idOfLength(254)}->1)`);
  expectError(`(${idOfLength(255)}->1)`);
});
