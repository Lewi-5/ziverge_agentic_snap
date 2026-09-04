import test from "node:test";
import assert from "node:assert/strict";
import { compareCausal, joinVersions } from "../src/domain/version/compare.js";
import { formatVersion } from "../src/domain/version/format.js";
import { parseVersion } from "../src/domain/version/parse.js";
function v(text) {
    const result = parseVersion(text);
    assert.equal(result.ok, true, `fixture '${text}' must parse`);
    if (!result.ok) {
        throw new Error("unreachable");
    }
    return result.value;
}
test("equal", () => {
    assert.equal(compareCausal(v("(a@x->1)"), v("(a@x->1)")), "equal");
    assert.equal(compareCausal(v("()"), v("()")), "equal");
});
test("before / after", () => {
    assert.equal(compareCausal(v("(a@x->1)"), v("(a@x->2)")), "before");
    assert.equal(compareCausal(v("(a@x->2)"), v("(a@x->1)")), "after");
    assert.equal(compareCausal(v("()"), v("(a@x->1)")), "before");
    assert.equal(compareCausal(v("(a@x->1,b@x->1)"), v("(a@x->2,b@x->1)")), "before");
});
test("concurrent, including disjoint contributor sets", () => {
    assert.equal(compareCausal(v("(a@x->1)"), v("(b@x->1)")), "concurrent");
    assert.equal(compareCausal(v("(a@x->1,b@x->2)"), v("(a@x->2,b@x->1)")), "concurrent");
});
test("absent component treated as zero", () => {
    assert.equal(compareCausal(v("(a@x->1)"), v("(a@x->1,b@x->1)")), "before");
});
test("join is componentwise max and stays canonically sorted", () => {
    const joined = joinVersions(v("(a@x->1,c@x->5)"), v("(b@x->2,c@x->3)"));
    assert.equal(formatVersion(joined), "(a@x->1,b@x->2,c@x->5)");
});
test("join is idempotent, commutative, and associative", () => {
    const a = v("(a@x->2,b@x->1)");
    const b = v("(a@x->1,b@x->3)");
    const c = v("(c@x->4)");
    assert.equal(formatVersion(joinVersions(a, a)), formatVersion(a));
    assert.equal(formatVersion(joinVersions(a, b)), formatVersion(joinVersions(b, a)));
    assert.equal(formatVersion(joinVersions(joinVersions(a, b), c)), formatVersion(joinVersions(a, joinVersions(b, c))));
});
test("join does not mutate its inputs and returns an immutable result", () => {
    const a = v("(a@x->1)");
    const before = formatVersion(a);
    const joined = joinVersions(a, v("(b@x->1)"));
    assert.equal(formatVersion(a), before);
    assert.equal(Object.isFrozen(joined), true);
    assert.equal(Object.isFrozen(joined.components), true);
});
