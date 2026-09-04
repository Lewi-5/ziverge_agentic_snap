import test from "node:test";
import assert from "node:assert/strict";
import { sortWarningFacts } from "../src/domain/history/warnings.js";
import { patchesStructurallyEqual } from "../src/domain/repository/structural-equality.js";
import { createContributorId } from "../src/domain/version/contributor-id.js";
import { EMPTY_VERSION } from "../src/domain/version/types.js";
function patch(message) {
    const author = createContributorId("a@x");
    if (!author.ok)
        throw new Error(author.error.detail);
    return {
        author: author.value,
        revision: 1,
        base: EMPTY_VERSION,
        message,
        changes: [{ type: "text", path: "f", edit: [{ insert: ["x\n"] }] }],
    };
}
test("warning facts sort by unsigned UTF-8 path then reason and deduplicate pairs", () => {
    assert.deepEqual(sortWarningFacts([
        { path: "z", reason: "put-wins" },
        { path: "a", reason: "namespace-wins" },
        { path: "a", reason: "delete-wins" },
        { path: "a", reason: "delete-wins" },
    ]), [
        { path: "a", reason: "delete-wins" },
        { path: "a", reason: "namespace-wins" },
        { path: "z", reason: "put-wins" },
    ]);
});
test("patch structural equality ignores object identity but detects any typed-value difference", () => {
    const left = patch("same");
    const right = patch("same");
    assert.equal(patchesStructurallyEqual(left, right), true);
    assert.equal(patchesStructurallyEqual(left, patch("different")), false);
});
