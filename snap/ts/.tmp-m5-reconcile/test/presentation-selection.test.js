import test from "node:test";
import assert from "node:assert/strict";
import { resolvePresentation } from "../src/cli/presentation.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeTerminalAdapter } from "../src/adapters/node-terminal-adapter.js";
test("rejects invalid SNAP_COLOR values with plain error", () => {
    const env = createNodeEnvironmentAdapter({ SNAP_COLOR: "invalid" });
    const term = createNodeTerminalAdapter({ stdoutTty: true, stderrTty: true });
    const result = resolvePresentation(env, term);
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.detail, "SNAP_COLOR must be auto, always, or never");
    }
});
test("SNAP_COLOR=always forces terminal mode on both streams even without TTY and with NO_COLOR", () => {
    const env = createNodeEnvironmentAdapter({ SNAP_COLOR: "always", NO_COLOR: "1" });
    const term = createNodeTerminalAdapter({ stdoutTty: false, stderrTty: false });
    const result = resolvePresentation(env, term);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.stdout, "terminal");
        assert.equal(result.value.stderr, "terminal");
    }
});
test("SNAP_COLOR=never forces plain mode on both streams even with TTY", () => {
    const env = createNodeEnvironmentAdapter({ SNAP_COLOR: "never" });
    const term = createNodeTerminalAdapter({ stdoutTty: true, stderrTty: true });
    const result = resolvePresentation(env, term);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.stdout, "plain");
        assert.equal(result.value.stderr, "plain");
    }
});
test("NO_COLOR presence selects plain mode in auto mode", () => {
    const envEmpty = createNodeEnvironmentAdapter({ SNAP_COLOR: "auto", NO_COLOR: "" });
    const term = createNodeTerminalAdapter({ stdoutTty: true, stderrTty: true });
    const resultEmpty = resolvePresentation(envEmpty, term);
    assert.equal(resultEmpty.ok, true);
    if (resultEmpty.ok) {
        assert.equal(resultEmpty.value.stdout, "plain");
        assert.equal(resultEmpty.value.stderr, "plain");
    }
    const envUnsetSnap = createNodeEnvironmentAdapter({ NO_COLOR: "anything" });
    const resultUnsetSnap = resolvePresentation(envUnsetSnap, term);
    assert.equal(resultUnsetSnap.ok, true);
    if (resultUnsetSnap.ok) {
        assert.equal(resultUnsetSnap.value.stdout, "plain");
        assert.equal(resultUnsetSnap.value.stderr, "plain");
    }
});
test("auto mode without NO_COLOR evaluates stdout and stderr TTY independently", () => {
    const env = createNodeEnvironmentAdapter({ SNAP_COLOR: "auto" });
    const term1 = createNodeTerminalAdapter({ stdoutTty: true, stderrTty: false });
    const res1 = resolvePresentation(env, term1);
    assert.equal(res1.ok, true);
    if (res1.ok) {
        assert.equal(res1.value.stdout, "terminal");
        assert.equal(res1.value.stderr, "plain");
    }
    const term2 = createNodeTerminalAdapter({ stdoutTty: false, stderrTty: true });
    const res2 = resolvePresentation(env, term2);
    assert.equal(res2.ok, true);
    if (res2.ok) {
        assert.equal(res2.value.stdout, "plain");
        assert.equal(res2.value.stderr, "terminal");
    }
    const term3 = createNodeTerminalAdapter({ stdoutTty: true, stderrTty: true });
    const res3 = resolvePresentation(env, term3);
    assert.equal(res3.ok, true);
    if (res3.ok) {
        assert.equal(res3.value.stdout, "terminal");
        assert.equal(res3.value.stderr, "terminal");
    }
});
