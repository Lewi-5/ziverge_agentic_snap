import test from "node:test";
import assert from "node:assert/strict";
import { materializeVersion } from "../src/domain/history/materialize.js";
import { selectKnownPatches } from "../src/domain/repository/known-version.js";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import { validateRepository } from "../src/domain/repository/validate.js";
import { parseVersion } from "../src/domain/version/parse.js";
function version(text) {
    const result = parseVersion(text);
    if (!result.ok)
        throw new Error(result.error.detail);
    return result.value;
}
function repository(value) {
    const decoded = decodeRepositoryDocument(value);
    if (!decoded.ok)
        throw new Error(decoded.error.detail);
    const validated = validateRepository(decoded.value);
    if (!validated.ok)
        throw new Error(validated.error.detail);
    return validated.value;
}
function decode(tree, path) {
    const bytes = tree.get(path);
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}
function assertValidatedBoundary(document, target) {
    // These calls intentionally remain compile-time failures. M3's staged
    // boundary required callers to prove validation before using repository
    // history, and M5 must preserve that guarantee for arbitrary DAG replay.
    // @ts-expect-error A decoded/constructed document is not a ValidatedRepository.
    materializeVersion(document, target);
    // @ts-expect-error Known-version selection also requires the validated brand.
    selectKnownPatches(document, target);
}
void assertValidatedBoundary;
const threeEditors = {
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
    patches: [
        { author: "a@x", revision: 1, base: [], message: "base", changes: [{ type: "text", path: "f", edit: [{ insert: ["base\n"] }] }] },
        { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b", changes: [{ type: "text", path: "f", edit: [{ insert: ["b\n"] }, { retain: 1 }] }] },
        { author: "c@x", revision: 1, base: [["a@x", 1]], message: "c", changes: [{ type: "text", path: "f", edit: [{ insert: ["c\n"] }, { retain: 1 }] }] },
    ],
};
test("materialization performs aggregate-context OT for three concurrent text patches", () => {
    const validated = repository(threeEditors);
    const result = materializeVersion(validated, validated.document.frontier);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(decode(result.value.tree, "f"), "c\nb\nbase\n");
        assert.deepEqual(result.value.warnings, []);
    }
});
test("known versions include causal joins that are not patch result versions", () => {
    const validated = repository({
        format: 1,
        frontier: [["a@x", 2], ["b@x", 1]],
        patches: [
            { author: "a@x", revision: 1, base: [], message: "a1", changes: [{ type: "text", path: "a", edit: [] }] },
            { author: "a@x", revision: 2, base: [["a@x", 1], ["b@x", 1]], message: "a2", changes: [{ type: "text", path: "c", edit: [] }] },
            { author: "b@x", revision: 1, base: [], message: "b1", changes: [{ type: "text", path: "b", edit: [] }] },
        ],
    });
    const joined = version("(a@x->1,b@x->1)");
    const selected = selectKnownPatches(validated, joined);
    assert.equal(selected.ok, true);
    if (selected.ok)
        assert.deepEqual(selected.value.map((patch) => `${patch.author}:${String(patch.revision)}`), ["a@x:1", "b@x:1"]);
    const materialized = materializeVersion(validated, joined);
    assert.equal(materialized.ok, true);
    if (materialized.ok)
        assert.deepEqual([...materialized.value.tree.keys()].sort(), ["a", "b"]);
});
test("known-version selection rejects excessive counters and omitted closure", () => {
    const validated = repository({
        format: 1,
        frontier: [["a@x", 1], ["b@x", 1]],
        patches: [
            { author: "a@x", revision: 1, base: [], message: "a", changes: [{ type: "text", path: "a", edit: [] }] },
            { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b", changes: [{ type: "text", path: "b", edit: [] }] },
        ],
    });
    assert.equal(selectKnownPatches(validated, version("(a@x->2,b@x->1)")).ok, false);
    assert.equal(selectKnownPatches(validated, version("(b@x->1)")).ok, false);
    assert.equal(selectKnownPatches(validated, version("()")).ok, true);
});
test("replay is independent of in-memory patch storage order", () => {
    const validated = repository(threeEditors);
    const expected = materializeVersion(validated, validated.document.frontier);
    assert.equal(expected.ok, true);
    const permutations = [
        [...validated.document.patches].reverse(),
        [validated.document.patches[1], validated.document.patches[2], validated.document.patches[0]],
    ];
    for (const patches of permutations) {
        const document = { ...validated.document, patches: patches.filter((patch) => patch !== undefined) };
        // Deliberately bypass the public brand only in this white-box property
        // test: replay must not depend on storage order even though the schema
        // boundary requires canonical storage order.
        const permuted = { document };
        const actual = materializeVersion(permuted, document.frontier);
        assert.equal(actual.ok, true);
        if (expected.ok && actual.ok) {
            assert.equal(decode(actual.value.tree, "f"), decode(expected.value.tree, "f"));
            assert.deepEqual(actual.value.warnings, expected.value.warnings);
        }
    }
});
test("namespace replay is simultaneous and produces sorted warning facts", () => {
    const validated = repository({
        format: 1,
        frontier: [["a@x", 1], ["z@x", 1]],
        patches: [
            { author: "a@x", revision: 1, base: [], message: "ancestor", changes: [{ type: "text", path: "a", edit: [{ insert: ["winner"] }] }] },
            { author: "z@x", revision: 1, base: [], message: "descendants", changes: [
                    { type: "text", path: "a/b", edit: [{ insert: ["b"] }] },
                    { type: "text", path: "a/c", edit: [{ insert: ["c"] }] },
                ] },
        ],
    });
    const result = materializeVersion(validated, validated.document.frontier);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.deepEqual([...result.value.tree.keys()], ["a"]);
        assert.deepEqual(result.value.warnings, [
            { path: "a/b", reason: "namespace-wins" },
            { path: "a/c", reason: "namespace-wins" },
        ]);
    }
});
