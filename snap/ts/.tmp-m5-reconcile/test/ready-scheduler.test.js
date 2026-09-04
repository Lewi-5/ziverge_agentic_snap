import test from "node:test";
import assert from "node:assert/strict";
import { schedulePatches } from "../src/domain/history/ready-scheduler.js";
import { createContributorId } from "../src/domain/version/contributor-id.js";
import { createVersion } from "../src/domain/version/construct.js";
function id(value) {
    const result = createContributorId(value);
    if (!result.ok)
        throw new Error(result.error.detail);
    return result.value;
}
function version(...components) {
    const result = createVersion(components.map(([contributorId, revision]) => ({ contributorId, revision })));
    if (!result.ok)
        throw new Error(result.error.detail);
    return result.value;
}
const alice = id("alice@example.com");
const bob = id("bob@example.com");
const cara = id("cara@example.com");
test("scheduler handles empty and linear histories", () => {
    assert.deepEqual(schedulePatches([]), { ok: true, value: [] });
    const first = { author: alice, revision: 1, base: version(), label: "a1" };
    const second = { author: alice, revision: 2, base: version([alice, 1]), label: "a2" };
    const scheduled = schedulePatches([second, first]);
    assert.equal(scheduled.ok, true);
    if (scheduled.ok)
        assert.deepEqual(scheduled.value.map((patch) => patch.label), ["a1", "a2"]);
});
test("scheduler recomputes readiness and orders concurrent results by Snap order", () => {
    const patches = [
        { author: cara, revision: 1, base: version([alice, 1], [bob, 1]), label: "c1" },
        { author: bob, revision: 1, base: version(), label: "b1" },
        { author: alice, revision: 2, base: version([alice, 1]), label: "a2" },
        { author: alice, revision: 1, base: version(), label: "a1" },
    ];
    const scheduled = schedulePatches(patches);
    assert.equal(scheduled.ok, true);
    if (scheduled.ok)
        assert.deepEqual(scheduled.value.map((patch) => patch.label), ["b1", "a1", "c1", "a2"]);
});
test("scheduler output is independent of storage permutation", () => {
    const a1 = { author: alice, revision: 1, base: version(), label: "a1" };
    const b1 = { author: bob, revision: 1, base: version(), label: "b1" };
    const a2 = { author: alice, revision: 2, base: version([alice, 1], [bob, 1]), label: "a2" };
    for (const input of [[a1, b1, a2], [a2, a1, b1], [b1, a2, a1]]) {
        const scheduled = schedulePatches(input);
        assert.equal(scheduled.ok, true);
        if (scheduled.ok)
            assert.deepEqual(scheduled.value.map((patch) => patch.label), ["b1", "a1", "a2"]);
    }
});
test("scheduler rejects invalid result transitions and exhausted ready sets", () => {
    assert.equal(schedulePatches([{ author: alice, revision: 2, base: version() }]).ok, false);
    const cycle = [
        { author: alice, revision: 1, base: version([bob, 1]) },
        { author: bob, revision: 1, base: version([alice, 1]) },
    ];
    assert.equal(schedulePatches(cycle).ok, false);
});
