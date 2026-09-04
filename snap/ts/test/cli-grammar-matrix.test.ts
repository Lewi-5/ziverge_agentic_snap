import test from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs, GRAMMAR_ERROR, DIFF_USAGE_ERROR } from "../src/cli/grammar.js";

test("empty argv fails with grammar error", () => {
  const result = parseCliArgs([]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error, GRAMMAR_ERROR);
  }
});

test("--version handling", () => {
  const okResult = parseCliArgs(["--version"]);
  assert.equal(okResult.ok, true);
  if (okResult.ok) {
    assert.equal(okResult.value.kind, "version");
  }

  const errResult = parseCliArgs(["--version", "extra"]);
  assert.equal(errResult.ok, false);
  if (!errResult.ok) {
    assert.deepEqual(errResult.error, GRAMMAR_ERROR);
  }
});

test("init grammar forms", () => {
  const noArgs = parseCliArgs(["init"]);
  assert.equal(noArgs.ok, true);
  if (noArgs.ok) {
    assert.equal(noArgs.value.kind, "init");
  }

  const withPath = parseCliArgs(["init", "my-repo"]);
  assert.equal(withPath.ok, true);
  if (withPath.ok && withPath.value.kind === "init") {
    assert.equal(withPath.value.path, "my-repo");
  }

  assert.equal(parseCliArgs(["init", "a", "b"]).ok, false);
  assert.equal(parseCliArgs(["init", "--unknown"]).ok, false);
});

test("config grammar forms", () => {
  const localConfig = parseCliArgs(["config", "contributor.id", "alice@example.com"]);
  assert.equal(localConfig.ok, true);
  if (localConfig.ok && localConfig.value.kind === "config") {
    assert.equal(localConfig.value.isGlobal, false);
    assert.equal(localConfig.value.key, "contributor.id");
    assert.equal(localConfig.value.value, "alice@example.com");
  }

  const globalConfig = parseCliArgs(["config", "--global", "contributor.id", "alice@example.com"]);
  assert.equal(globalConfig.ok, true);
  if (globalConfig.ok && globalConfig.value.kind === "config") {
    assert.equal(globalConfig.value.isGlobal, true);
    assert.equal(globalConfig.value.key, "contributor.id");
    assert.equal(globalConfig.value.value, "alice@example.com");
  }

  // Misplaced, duplicate, or wrong key
  assert.equal(parseCliArgs(["config", "contributor.id", "a@x", "--global"]).ok, false);
  assert.equal(parseCliArgs(["config", "--global", "--global", "contributor.id", "a@x"]).ok, false);
  assert.equal(parseCliArgs(["config", "other.key", "value"]).ok, false);
  assert.equal(parseCliArgs(["config", "--global", "contributor.id"]).ok, false);
});

test("status grammar forms", () => {
  const res = parseCliArgs(["status"]);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.kind, "status");
  }

  assert.equal(parseCliArgs(["status", "extra"]).ok, false);
});

test("log grammar forms", () => {
  const res = parseCliArgs(["log"]);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.kind, "log");
  }

  assert.equal(parseCliArgs(["log", "--unknown"]).ok, false);
});

test("commit grammar forms", () => {
  assert.equal(parseCliArgs(["commit"]).ok, false);

  const res = parseCliArgs(["commit", "my message"]);
  assert.equal(res.ok, true);
  if (res.ok && res.value.kind === "commit") {
    assert.equal(res.value.message, "my message");
  }

  assert.equal(parseCliArgs(["commit", "msg", "extra"]).ok, false);
  assert.equal(parseCliArgs(["commit", "--unknown"]).ok, false);
});

test("diff grammar forms and usage diagnostics", () => {
  const noArgs = parseCliArgs(["diff"]);
  assert.equal(noArgs.ok, true);
  if (noArgs.ok && noArgs.value.kind === "diff") {
    assert.equal(noArgs.value.oldVersion, undefined);
    assert.equal(noArgs.value.newVersion, undefined);
    assert.equal(noArgs.value.repo, undefined);
  }

  const twoVersions = parseCliArgs(["diff", "()", "(a->1)"]);
  assert.equal(twoVersions.ok, true);
  if (twoVersions.ok && twoVersions.value.kind === "diff") {
    assert.equal(twoVersions.value.oldVersion, "()");
    assert.equal(twoVersions.value.newVersion, "(a->1)");
    assert.equal(twoVersions.value.repo, undefined);
  }

  const crossRepo = parseCliArgs(["diff", "()", "(a->1)", "--repo", "../other"]);
  assert.equal(crossRepo.ok, true);
  if (crossRepo.ok && crossRepo.value.kind === "diff") {
    assert.equal(crossRepo.value.oldVersion, "()");
    assert.equal(crossRepo.value.newVersion, "(a->1)");
    assert.equal(crossRepo.value.repo, "../other");
  }

  // All invalid shapes yield DIFF_USAGE_ERROR
  const invalid1 = parseCliArgs(["diff", "()"]);
  assert.equal(invalid1.ok, false);
  if (!invalid1.ok) {
    assert.deepEqual(invalid1.error, DIFF_USAGE_ERROR);
  }

  const invalid2 = parseCliArgs(["diff", "()", "()", "--unknown", "repo"]);
  assert.equal(invalid2.ok, false);
  if (!invalid2.ok) {
    assert.deepEqual(invalid2.error, DIFF_USAGE_ERROR);
  }

  const invalid3 = parseCliArgs(["diff", "()", "()", "--repo", "repo", "--repo", "repo"]);
  assert.equal(invalid3.ok, false);
  if (!invalid3.ok) {
    assert.deepEqual(invalid3.error, DIFF_USAGE_ERROR);
  }

  const invalid4 = parseCliArgs(["diff", "()", "()", "../repo", "--repo"]);
  assert.equal(invalid4.ok, false);
  if (!invalid4.ok) {
    assert.deepEqual(invalid4.error, DIFF_USAGE_ERROR);
  }
});

test("revert grammar forms", () => {
  assert.equal(parseCliArgs(["revert"]).ok, false);

  const res = parseCliArgs(["revert", "(alice@example.com->1)"]);
  assert.equal(res.ok, true);
  if (res.ok && res.value.kind === "revert") {
    assert.equal(res.value.version, "(alice@example.com->1)");
  }

  assert.equal(parseCliArgs(["revert", "()", "extra"]).ok, false);
  assert.equal(parseCliArgs(["revert", "--unknown"]).ok, false);
});

test("merge grammar forms", () => {
  assert.equal(parseCliArgs(["merge"]).ok, false);

  const res = parseCliArgs(["merge", "../other-repo"]);
  assert.equal(res.ok, true);
  if (res.ok && res.value.kind === "merge") {
    assert.equal(res.value.repository, "../other-repo");
  }

  assert.equal(parseCliArgs(["merge", "repo", "extra"]).ok, false);
  assert.equal(parseCliArgs(["merge", "--unknown"]).ok, false);
});

test("--serve grammar forms and port validation", () => {
  const defaultPort = parseCliArgs(["--serve"]);
  assert.equal(defaultPort.ok, true);
  if (defaultPort.ok && defaultPort.value.kind === "serve") {
    assert.equal(defaultPort.value.port, 8765);
  }

  const ephemeralPort = parseCliArgs(["--serve", "0"]);
  assert.equal(ephemeralPort.ok, true);
  if (ephemeralPort.ok && ephemeralPort.value.kind === "serve") {
    assert.equal(ephemeralPort.value.port, 0);
  }

  const customPort = parseCliArgs(["--serve", "8080"]);
  assert.equal(customPort.ok, true);
  if (customPort.ok && customPort.value.kind === "serve") {
    assert.equal(customPort.value.port, 8080);
  }

  assert.equal(parseCliArgs(["--serve", "0", "extra"]).ok, false);

  // Invalid ports
  const outOfRange = parseCliArgs(["--serve", "65536"]);
  assert.equal(outOfRange.ok, false);
  if (!outOfRange.ok) {
    assert.equal(outOfRange.error.detail, "invalid port: 65536");
  }

  const negative = parseCliArgs(["--serve", "-1"]);
  assert.equal(negative.ok, false);
  if (!negative.ok) {
    assert.equal(negative.error.detail, "invalid port: -1");
  }

  const nonNumeric = parseCliArgs(["--serve", "abc"]);
  assert.equal(nonNumeric.ok, false);
  if (!nonNumeric.ok) {
    assert.equal(nonNumeric.error.detail, "invalid port: abc");
  }

  const decimal = parseCliArgs(["--serve", "80.5"]);
  assert.equal(decimal.ok, false);
  if (!decimal.ok) {
    assert.equal(decimal.error.detail, "invalid port: 80.5");
  }
});
