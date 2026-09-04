import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";

test("log: empty history produces no output", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const outcome = await cli.run(["log"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "");
  } finally {
    await cli.cleanup();
  }
});

test("log: reverse canonical order, no blank line between entries, and the exact scenario 04 escape golden", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/a.txt", "a\n");
    // Literal tab, LF, and backslash in the message, exactly as scenario 04 uses.
    await cli.run(["commit", "first\tline\nsecond\\tail"], `${cli.root}/repo`);
    await cli.writeFile("repo/a.txt", "a2\n");
    await cli.run(["commit", "second"], `${cli.root}/repo`);

    const outcome = await cli.run(["log"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(
      outcome.stdout,
      "(alice@example.com->2)\talice@example.com\tsecond\n(alice@example.com->1)\talice@example.com\tfirst\\tline\\nsecond\\\\tail\n",
    );
    assert.equal(outcome.stderr, "");
    // No blank line between records (module3planCORRECTIONS.md #6).
    assert.equal(outcome.stdout.includes("\n\n"), false);
  } finally {
    await cli.cleanup();
  }
});

test("log: an extra argument is a grammar error", async () => {
  const cli = await createRealCli();
  try {
    const outcome = await cli.run(["log", "extra"]);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stderr, "snap: invalid command or arguments\n");
  } finally {
    await cli.cleanup();
  }
});
