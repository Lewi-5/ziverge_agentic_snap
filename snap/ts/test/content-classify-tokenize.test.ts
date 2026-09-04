import test from "node:test";
import assert from "node:assert/strict";
import { classifyContent } from "../src/domain/content/classify.js";
import { joinTextTokens, tokenizeText, validateTokenSequence } from "../src/domain/content/tokenize.js";

const encoder = new TextEncoder();

test("classifies and tokenizes empty, CRLF, lone CR, Unicode, and unterminated text exactly", () => {
  const cases = ["", "a\n", "a\r\nb", "a\rb", "café\n😀"];
  for (const text of cases) {
    const content = classifyContent(encoder.encode(text));
    assert.equal(content.kind, "text");
    if (content.kind === "text") {
      assert.equal(content.text, text);
      assert.equal(joinTextTokens(content.tokens), text);
      assert.deepEqual(content.tokens, tokenizeText(text));
      assert.deepEqual(content.bytes, [...encoder.encode(text)]);
    }
  }
  assert.deepEqual(tokenizeText("a\r\nb"), ["a\r\n", "b"]);
  assert.deepEqual(tokenizeText("a\n"), ["a\n"]);
  assert.deepEqual(tokenizeText(""), []);
});

test("classification rejects malformed UTF-8 families and every NUL-containing input", () => {
  const binaries = [
    new Uint8Array([0xc3]),
    new Uint8Array([0xc0, 0xaf]),
    new Uint8Array([0xed, 0xa0, 0x80]),
    new Uint8Array([0xf4, 0x90, 0x80, 0x80]),
    new Uint8Array([0]),
    new Uint8Array([0x61, 0, 0x62]),
  ];
  for (const bytes of binaries) assert.equal(classifyContent(bytes).kind, "binary");
});

test("classification copies bytes and exposes an immutable byte sequence", () => {
  const source = encoder.encode("hello");
  const content = classifyContent(source);
  source[0] = 0;
  assert.deepEqual(content.bytes, [...encoder.encode("hello")]);
  assert.equal(Object.isFrozen(content.bytes), true);
});

test("token validation enforces canonical boundaries and Unicode scalar values", () => {
  assert.equal(validateTokenSequence(["a\n", "b"]).ok, true);
  assert.equal(validateTokenSequence([]).ok, true);
  for (const value of [[""], ["a", "b"], ["a\nb"], ["\ud800"], "a\n"]) {
    assert.equal(validateTokenSequence(value).ok, false);
  }
});

