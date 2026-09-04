import test from "node:test";
import assert from "node:assert/strict";
import { compareCausal } from "../src/domain/version/compare.js";
import { compareSnapOrder } from "../src/domain/version/snap-order.js";
import { parseVersion } from "../src/domain/version/parse.js";
function v(text) {
    const result = parseVersion(text);
    assert.equal(result.ok, true, `fixture '${text}' must parse`);
    if (!result.ok) {
        throw new Error("unreachable");
    }
    return result.value;
}
test("first unequal counter, in sorted-id order, decides", () => {
    // sorted union of ids is [a@x, b@x]; a@x ties at 1, b@x differs 1 < 2.
    assert.equal(compareSnapOrder(v("(a@x->1,b@x->1)"), v("(a@x->1,b@x->2)")), -1);
    // a@x differs first (1 < 2), regardless of b@x.
    assert.equal(compareSnapOrder(v("(a@x->1,b@x->2)"), v("(a@x->2,b@x->1)")), -1);
});
test("equal versions compare as 0", () => {
    assert.equal(compareSnapOrder(v("(a@x->1)"), v("(a@x->1)")), 0);
    assert.equal(compareSnapOrder(v("()"), v("()")), 0);
});
test("disjoint contributor sets still produce a definite order", () => {
    const result = compareSnapOrder(v("(a@x->1)"), v("(b@x->1)"));
    assert.notEqual(result, 0);
});
test("Snap order extends causal order: before implies snap-order negative", () => {
    const pairs = [
        [v("()"), v("(a@x->1)")],
        [v("(a@x->1)"), v("(a@x->2)")],
        [v("(a@x->1,b@x->1)"), v("(a@x->2,b@x->1)")],
        [v("(a@x->1)"), v("(a@x->1,b@x->1)")],
    ];
    for (const [before, after] of pairs) {
        assert.equal(compareCausal(before, after), "before");
        assert.equal(compareSnapOrder(before, after), -1);
        assert.equal(compareSnapOrder(after, before), 1);
    }
});
