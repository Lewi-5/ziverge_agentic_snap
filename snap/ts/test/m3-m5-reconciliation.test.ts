import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";

const concurrentRepository = {
  format: 1,
  frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
  patches: [
    {
      author: "a@x",
      revision: 1,
      base: [],
      message: "base",
      changes: [{ type: "text", path: "f", edit: [{ insert: ["base\n"] }] }],
    },
    {
      author: "b@x",
      revision: 1,
      base: [["a@x", 1]],
      message: "b concurrently inserts",
      changes: [{ type: "text", path: "f", edit: [{ insert: ["b\n"] }, { retain: 1 }] }],
    },
    {
      author: "c@x",
      revision: 1,
      base: [["a@x", 1]],
      message: "c concurrently inserts",
      changes: [{ type: "text", path: "f", edit: [{ insert: ["c\n"] }, { retain: 1 }] }],
    },
  ],
} as const;

async function createConcurrentRepository() {
  const cli = await createRealCli();
  await cli.run(["init", "repo"]);
  await cli.writeFile("repo/.snap/repository.json", `${JSON.stringify(concurrentRepository, null, 2)}\n`);
  await cli.writeFile("repo/f", "c\nb\nbase\n");
  return cli;
}

test("M3 status and log consume M5 replay order for a concurrent repository", async () => {
  const cli = await createConcurrentRepository();
  try {
    const status = await cli.run(["status"], `${cli.root}/repo`);
    assert.equal(status.exitCode, 0);
    assert.equal(status.stdout, "version (a@x->1,b@x->1,c@x->1)\n");
    assert.equal(status.stderr, "");

    const log = await cli.run(["log"], `${cli.root}/repo`);
    assert.equal(log.exitCode, 0);
    assert.equal(
      log.stdout,
      "(a@x->1,b@x->1)\tb@x\tb concurrently inserts\n" +
        "(a@x->1,c@x->1)\tc@x\tc concurrently inserts\n" +
        "(a@x->1)\ta@x\tbase\n",
    );
    assert.equal(log.stderr, "");
  } finally {
    await cli.cleanup();
  }
});

test("M3 historical diff materializes an M5 causal join", async () => {
  const cli = await createConcurrentRepository();
  try {
    const diff = await cli.run(["diff", "(a@x->1)", "(a@x->1,b@x->1,c@x->1)"], `${cli.root}/repo`);
    assert.equal(diff.exitCode, 0);
    assert.equal(diff.stdout, "--- a/f\n+++ b/f\n@@ -1,1 +1,3 @@\n+c\n+b\n base\n");
    assert.equal(diff.stderr, "");
  } finally {
    await cli.cleanup();
  }
});

test("M3 commit preserves an M5 multi-author frontier as its exact base", async () => {
  const cli = await createConcurrentRepository();
  try {
    await cli.run(["config", "contributor.id", "d@x"], `${cli.root}/repo`);
    await cli.writeFile("repo/f", "c\nb\nbase\nlocal\n");

    const commit = await cli.run(["commit", "after merge"], `${cli.root}/repo`);
    assert.equal(commit.exitCode, 0);
    assert.equal(commit.stdout, "(a@x->1,b@x->1,c@x->1,d@x->1)\n");
    assert.equal(commit.stderr, "");

    const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json")) as {
      readonly frontier: readonly (readonly [string, number])[];
      readonly patches: readonly {
        readonly author: string;
        readonly revision: number;
        readonly base: readonly (readonly [string, number])[];
      }[];
    };
    assert.deepEqual(manifest.frontier, [["a@x", 1], ["b@x", 1], ["c@x", 1], ["d@x", 1]]);
    const committed = manifest.patches.find((patch) => patch.author === "d@x");
    assert.deepEqual(committed, {
      author: "d@x",
      revision: 1,
      base: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
      message: "after merge",
      changes: [{ type: "text", path: "f", edit: [{ retain: 3 }, { insert: ["local\n"] }] }],
    });
  } finally {
    await cli.cleanup();
  }
});
