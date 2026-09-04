import test from "node:test";
import assert from "node:assert/strict";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
test("returns the variable's value when set in the injected environment", () => {
    const environment = createNodeEnvironmentAdapter({ HOME: "/home/alice" });
    assert.equal(environment.getEnv("HOME"), "/home/alice");
});
test("returns undefined when the variable is not set", () => {
    const environment = createNodeEnvironmentAdapter({});
    assert.equal(environment.getEnv("HOME"), undefined);
});
test("does not read or mutate global process.env when given an injected source", () => {
    const originalHome = process.env["SNAP_TEST_UNSET_VAR"];
    const environment = createNodeEnvironmentAdapter({ HOME: "/injected" });
    assert.equal(environment.getEnv("SNAP_TEST_UNSET_VAR"), undefined);
    environment.getEnv("HOME");
    assert.equal(process.env["SNAP_TEST_UNSET_VAR"], originalHome);
});
