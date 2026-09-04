import test from "node:test";
import assert from "node:assert/strict";
import { renderDiffPlain } from "../src/cli/render-diff-plain.js";
import { renderDiffTerminal } from "../src/cli/render-terminal.js";
import { parseCliArgs, GRAMMAR_ERROR, DIFF_USAGE_ERROR } from "../src/cli/grammar.js";
import type { TextToken } from "../src/domain/content/types.js";

// Bug 1 -- Hunk start-line must be 0 when token count is 0

test("[Bug 1] renderDiffPlain new file: -1,0 not -0,0", () => {
  const result = renderDiffPlain([
  {
    kind: "text",
    path: "f.txt",
    oldLabel: "/dev/null",
    newLabel: "b/f.txt",
    oldTokenCount: 0,
    newTokenCount: 2,
    lines: [
      { kind: "insert", token: "line1\n" as TextToken },
      { kind: "insert", token: "line2\n" as TextToken },
    ],
  },
  ]);
  assert.ok(result.includes("-1,0"), result);
  assert.ok(!result.includes("-0,0"), result);
});

test("[Bug 1] renderDiffPlain deleted file: +1,0 not +0,0", () => {
  const result = renderDiffPlain([
  {
    kind: "text",
    path: "f.txt",
    oldLabel: "a/f.txt",
    newLabel: "/dev/null",
    oldTokenCount: 3,
    newTokenCount: 0,
    lines: [
      { kind: "delete", token: "a\n" as TextToken },
      { kind: "delete", token: "b\n" as TextToken },
      { kind: "delete", token: "c\n" as TextToken },
    ],
  },
  ]);
  assert.ok(result.includes("+1,0"), result);
  assert.ok(!result.includes("+0,0"), result);
});

test("[Bug 1] renderDiffPlain non-zero counts: start-line 1 (sanity)", () => {
  const result = renderDiffPlain([
  {
    kind: "text",
    path: "f.txt",
    oldLabel: "a/f.txt",
    newLabel: "b/f.txt",
    oldTokenCount: 1,
    newTokenCount: 1,
    lines: [
      { kind: "delete", token: "old\n" as TextToken },
      { kind: "insert", token: "new\n" as TextToken },
    ],
  },
  ]);
  assert.ok(result.includes("-1,1"), result);
  assert.ok(result.includes("+1,1"), result);
});

test("[Bug 1] renderDiffTerminal new file: -1,0 not -0,0", () => {
  const result = renderDiffTerminal([
  {
    kind: "text",
    path: "f.txt",
    oldLabel: "/dev/null",
    newLabel: "b/f.txt",
    oldTokenCount: 0,
    newTokenCount: 1,
    lines: [
      { kind: "insert", token: "hello\n" as TextToken },
    ],
  },
  ]);
  assert.ok(result.includes("-1,0"), result);
  assert.ok(result.includes("+1,1"), result);
  assert.ok(!result.includes("-0,0"), result);
});

test("[Bug 1] renderDiffTerminal deleted file: +1,0 not +0,0", () => {
  const result = renderDiffTerminal([
  {
    kind: "text",
    path: "f.txt",
    oldLabel: "a/f.txt",
    newLabel: "/dev/null",
    oldTokenCount: 2,
    newTokenCount: 0,
    lines: [
      { kind: "delete", token: "x\n" as TextToken },
      { kind: "delete", token: "y\n" as TextToken },
    ],
  },
  ]);
  assert.ok(result.includes("-1,2"), result);
  assert.ok(result.includes("+1,0"), result);
  assert.ok(!result.includes("+0,0"), result);
});

// Bug 2 -- diff with single unknown flag should give GRAMMAR_ERROR

test("[Bug 2] parseCliArgs diff --unknown: GRAMMAR_ERROR not DIFF_USAGE_ERROR", () => {
  const result = parseCliArgs(["diff", "--unknown"]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error, GRAMMAR_ERROR);
    assert.notDeepEqual(result.error, DIFF_USAGE_ERROR);
  }
});

test("[Bug 2] parseCliArgs diff --repo alone: GRAMMAR_ERROR", () => {
  const result = parseCliArgs(["diff", "--repo"]);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.deepEqual(result.error, GRAMMAR_ERROR); }
});

test("[Bug 2] parseCliArgs diff v1 --repo no-value: DIFF_USAGE_ERROR", () => {
  const result = parseCliArgs(["diff", "v1", "--repo"]);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.deepEqual(result.error, DIFF_USAGE_ERROR); }
});
