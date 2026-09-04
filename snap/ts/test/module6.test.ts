import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { subtractWarningFacts } from "../src/domain/history/warning-difference.js";
import { planTreeMutation } from "../src/domain/tree/mutation-plan.js";
import { createRealCli } from "./support/real-cli.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

test("warning difference is a sorted set of path/reason pairs", () => {
  const result = subtractWarningFacts(
    [
      { path: "z", reason: "put-wins" },
      { path: "a", reason: "later-put-wins" },
      { path: "a", reason: "later-put-wins" },
      { path: "a", reason: "delete-wins" },
    ],
    [{ path: "a", reason: "delete-wins" }],
  );
  assert.deepEqual(result, [
    { path: "a", reason: "later-put-wins" },
    { path: "z", reason: "put-wins" },
  ]);
});

test("mutation planning handles both file/directory transition directions deterministically", () => {
  const plan = planTreeMutation(
    new Map([["a", bytes("old")], ["z/x", bytes("remove")]]),
    new Map([["a/b", bytes("new")], ["z", bytes("replacement")]]),
  );
  assert.deepEqual(plan.removals, ["z/x", "a"]);
  assert.deepEqual(plan.writes.map((write) => write.path), ["a/b", "z"]);
});

test("revert authors an additive patch and materializes the historical tree", async () => {
  const cli = await createRealCli();
  try {
    assert.equal((await cli.run(["init"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"])).exitCode, 0);
    await cli.writeFile("note.txt", "one\n");
    const first = await cli.run(["commit", "one"]);
    assert.equal(first.stdout, "(alice@example.com->1)\n");
    await cli.writeFile("note.txt", "two\n");
    assert.equal((await cli.run(["commit", "two"])).exitCode, 0);

    const reverted = await cli.run(["revert", "(alice@example.com->1)"]);
    assert.deepEqual(reverted, { exitCode: 0, stdout: "(alice@example.com->3)\n", stderr: "" });
    assert.equal(await cli.readFile("note.txt"), "one\n");
    const log = await cli.run(["log"]);
    assert.match(log.stdout, /revert to \(alice@example\.com->1\)/);
  } finally {
    await cli.cleanup();
  }
});

test("local merge joins histories, updates files, and is idempotent", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    assert.equal((await cli.run(["init", "left"])).exitCode, 0);
    await cli.writeFile("left/base.txt", "base\n");
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"], left)).exitCode, 0);
    assert.equal((await cli.run(["commit", "base"], left)).exitCode, 0);

    await fs.cp(left, right, { recursive: true });
    await cli.writeFile("left/alice.txt", "alice\n");
    assert.equal((await cli.run(["commit", "alice"], left)).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "bob@example.com"], right)).exitCode, 0);
    await cli.writeFile("right/bob.txt", "bob\n");
    assert.equal((await cli.run(["commit", "bob"], right)).exitCode, 0);

    const crossDiff = await cli.run([
      "diff",
      "(alice@example.com->2)",
      "(alice@example.com->1,bob@example.com->1)",
      "--repo",
      right,
    ], left);
    assert.equal(crossDiff.exitCode, 0);
    assert.match(crossDiff.stdout, /alice\.txt/);
    assert.match(crossDiff.stdout, /bob\.txt/);

    const merged = await cli.run(["merge", right], left);
    assert.deepEqual(merged, {
      exitCode: 0,
      stdout: "(alice@example.com->2,bob@example.com->1)\n",
      stderr: "",
    });
    assert.equal(await fs.readFile(path.join(left, "bob.txt"), "utf8"), "bob\n");
    const metadataBefore = await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8");
    assert.equal((await cli.run(["merge", right], left)).stdout, "(alice@example.com->2,bob@example.com->1)\n");
    assert.equal(await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8"), metadataBefore);
  } finally {
    await cli.cleanup();
  }
});
