import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonStrict } from "../src/domain/json/parse-json-strict.js";

function expectValue(text: string, expected: unknown): void {
  const result = parseJsonStrict(text);
  assert.equal(result.ok, true, `expected '${text}' to parse`);
  if (result.ok) {
    assert.deepEqual(result.value, expected);
  }
}

function expectError(text: string, detailIncludes: string): void {
  const result = parseJsonStrict(text);
  assert.equal(result.ok, false, `expected '${text}' to be rejected`);
  if (!result.ok) {
    assert.ok(
      result.error.detail.includes(detailIncludes),
      `expected detail '${result.error.detail}' to include '${detailIncludes}'`,
    );
  }
}

test("parses primitives, arrays, and nested objects identically to JSON.parse", () => {
  expectValue('{"a":1,"b":[1,2,3],"c":{"d":true,"e":null,"f":"g"}}', {
    a: 1,
    b: [1, 2, 3],
    c: { d: true, e: null, f: "g" },
  });
  expectValue("42", 42);
  expectValue("-3.5e2", -350);
  expectValue('"hello"', "hello");
  expectValue("true", true);
  expectValue("false", false);
  expectValue("null", null);
  expectValue("[]", []);
  expectValue("{}", {});
});

test("arbitrary whitespace around tokens is accepted", () => {
  expectValue('\n\t {  "a" : 1 ,\r\n "b" : 2 }  \n', { a: 1, b: 2 });
});

test("duplicate key at root is rejected", () => {
  expectError('{"a":1,"a":2}', 'duplicate JSON key "a"');
});

test("duplicate key nested inside an object is rejected", () => {
  expectError('{"contributor":{"id":"a@x","id":"b@x"}}', 'duplicate JSON key "id"');
});

test("escape-equivalent duplicate key is rejected", () => {
  expectError('{"id":"a@x","\\u0069d":"b@x"}', 'duplicate JSON key "id"');
});

test("duplicate keys inside objects nested in arrays are rejected", () => {
  expectError('[{"a":1},{"b":1,"b":2}]', 'duplicate JSON key "b"');
});

test("same key at different nesting levels is not a duplicate", () => {
  expectValue('{"id":"a@x","nested":{"id":"b@x"}}', { id: "a@x", nested: { id: "b@x" } });
});

test("invalid JSON syntax is rejected", () => {
  expectError("not json", "invalid JSON");
  expectError('{"a":1,}', "invalid JSON");
  expectError('{"a":1', "invalid JSON");
  expectError("[1, 2,]", "invalid JSON");
  expectError("", "invalid JSON");
});

test("trailing content after a valid document is rejected", () => {
  expectError('{"a":1} extra', "invalid JSON");
});

test("unescaped control character in a string is rejected", () => {
  expectError('{"a":"line1\nline2"}', "invalid JSON");
});
