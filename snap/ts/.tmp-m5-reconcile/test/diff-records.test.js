import test from "node:test";
import assert from "node:assert/strict";
import { renderDiffPlain } from "../src/cli/render-diff-plain.js";
import { buildDiffRecords } from "../src/domain/tree/diff-records.js";
const bytes = (text) => new TextEncoder().encode(text);
test("renders canonical whole-file text diff and both missing-final-newline markers", () => {
    const records = buildDiffRecords(new Map([["note.txt", bytes("same\nold")]]), new Map([["note.txt", bytes("same\nnew")]]));
    assert.equal(renderDiffPlain(records), "--- a/note.txt\n" +
        "+++ b/note.txt\n" +
        "@@ -1,2 +1,2 @@\n" +
        " same\n" +
        "-old\n" +
        "\\ No newline at end of file\n" +
        "+new\n" +
        "\\ No newline at end of file\n");
});
test("renders create/delete headers, empty text hunk, and a binary notice", () => {
    const records = buildDiffRecords(new Map([["gone", bytes("bye\n")], ["raw", new Uint8Array([0])]]), new Map([["empty", bytes("")]]));
    assert.equal(renderDiffPlain(records), "--- /dev/null\n+++ b/empty\n@@ -1,0 +1,0 @@\n" +
        "--- a/gone\n+++ /dev/null\n@@ -1,1 +1,0 @@\n-bye\n" +
        "Binary files a/raw and /dev/null differ\n");
});
test("equal trees produce no records and zero plain output", () => {
    const oldTree = new Map([["same", bytes("same")]]);
    const newTree = new Map([["same", bytes("same")]]);
    assert.deepEqual(buildDiffRecords(oldTree, newTree), []);
    assert.equal(renderDiffPlain(buildDiffRecords(oldTree, newTree)), "");
});
test("semantic records retain line kinds for later presentation", () => {
    const records = buildDiffRecords(new Map([["x", bytes("a\n")]]), new Map([["x", bytes("b\n")]]));
    assert.equal(records[0]?.kind, "text");
    if (records[0]?.kind === "text")
        assert.deepEqual(records[0].lines.map((line) => line.kind), ["delete", "insert"]);
});
test("matches the public repeated-line and unterminated-create golden", () => {
    const records = buildDiffRecords(new Map([["repeated.txt", bytes("a\nb\na\n")]]), new Map([["added.txt", bytes("new")], ["repeated.txt", bytes("b\na\na")]]));
    assert.equal(renderDiffPlain(records), "--- /dev/null\n+++ b/added.txt\n@@ -1,0 +1,1 @@\n+new\n\\ No newline at end of file\n" +
        "--- a/repeated.txt\n+++ b/repeated.txt\n@@ -1,3 +1,3 @@\n-a\n b\n a\n+a\n\\ No newline at end of file\n");
});
test("matches the public CRLF, NUL-binary, and Unicode portability golden", () => {
    const records = buildDiffRecords(new Map(), new Map([
        ["unicode.txt", bytes("hé\n")], ["nul.bin", new Uint8Array([0x41, 0, 0x42])], ["crlf.txt", bytes("a\r\nb")],
    ]));
    assert.equal(renderDiffPlain(records), "--- /dev/null\n+++ b/crlf.txt\n@@ -1,0 +1,2 @@\n+a\r\n+b\n\\ No newline at end of file\n" +
        "Binary files /dev/null and b/nul.bin differ\n" +
        "--- /dev/null\n+++ b/unicode.txt\n@@ -1,0 +1,1 @@\n+hé\n");
});
