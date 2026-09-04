import test from "node:test";
import assert from "node:assert/strict";
import { compareTrees, isTreeClean } from "../src/domain/tree/compare.js";
function bytesOf(text) {
    return new TextEncoder().encode(text);
}
function treeOf(entries) {
    return new Map(Object.entries(entries).map(([path, text]) => [path, bytesOf(text)]));
}
test("clean tree produces no rows", () => {
    const tree = treeOf({ "a.txt": "same" });
    assert.deepEqual(compareTrees(tree, tree), []);
    assert.equal(isTreeClean(tree, treeOf({ "a.txt": "same" })), true);
});
test("classifies added, modified, and deleted paths, sorted by unsigned UTF-8 path order regardless of code", () => {
    const current = treeOf({ "a.txt": "old", "z.txt": "keep" });
    const working = treeOf({ "a.txt": "new", "m.txt": "added" });
    const rows = compareTrees(current, working);
    assert.deepEqual(rows, [
        { code: "M", path: "a.txt" },
        { code: "A", path: "m.txt" },
        { code: "D", path: "z.txt" },
    ]);
});
test("identical bytes at a path is not a modification", () => {
    const rows = compareTrees(treeOf({ "a.txt": "same" }), treeOf({ "a.txt": "same" }));
    assert.deepEqual(rows, []);
});
test("isTreeClean is false when any row exists", () => {
    assert.equal(isTreeClean(treeOf({}), treeOf({ "a.txt": "new" })), false);
});
