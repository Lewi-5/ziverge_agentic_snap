import test from "node:test";
import assert from "node:assert/strict";
import { selectAuthoredChanges } from "../src/domain/tree/change.js";
const bytes = (text) => new TextEncoder().encode(text);
const tree = (entries) => new Map(entries);
test("selects text, put, and delete at every content boundary", () => {
    const oldTree = tree([
        ["binary-to-text", new Uint8Array([0])], ["delete", bytes("old")], ["same", bytes("same")],
        ["text-to-binary", bytes("old")], ["text-to-text", bytes("old\n")],
    ]);
    const newTree = tree([
        ["binary-to-text", bytes("new")], ["create-empty", bytes("")], ["create-text", bytes("hello\n")],
        ["same", bytes("same")], ["text-to-binary", new Uint8Array([0xff])], ["text-to-text", bytes("new\n")],
    ]);
    assert.deepEqual(selectAuthoredChanges(oldTree, newTree), [
        { type: "put", path: "binary-to-text", content: "bmV3" },
        { type: "text", path: "create-empty", edit: [] },
        { type: "text", path: "create-text", edit: [{ insert: ["hello\n"] }] },
        { type: "delete", path: "delete" },
        { type: "put", path: "text-to-binary", content: "/w==" },
        { type: "text", path: "text-to-text", edit: [{ delete: 1 }, { insert: ["new\n"] }] },
    ]);
});
test("sorts paths by the shared unsigned UTF-8 comparator", () => {
    const changes = selectAuthoredChanges(new Map(), tree([
        ["😀", bytes("x")], ["é", bytes("x")], ["a/child", bytes("x")], ["a ", bytes("x")], ["a", bytes("x")],
    ]));
    assert.deepEqual(changes.map((change) => change.path), ["a", "a ", "a/child", "é", "😀"]);
});
