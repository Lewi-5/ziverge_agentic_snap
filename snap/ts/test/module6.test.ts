import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { subtractWarningFacts } from "../src/domain/history/warning-difference.js";
import { planTreeMutation } from "../src/domain/tree/mutation-plan.js";
import { checkPatchCollisions, unionRepositoryDocuments } from "../src/domain/repository/union.js";
import type { RepositoryDocument } from "../src/domain/repository/types.js";
import { createContributorId } from "../src/domain/version/contributor-id.js";
import { createVersion } from "../src/domain/version/construct.js";
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

test("mutation planning deepest-first sorting satisfies reflexivity and depth ordering", () => {
  const current = new Map([
    ["top.txt", bytes("1")],
    ["a/b/c/deep.txt", bytes("2")],
    ["a/b/mid.txt", bytes("3")],
    ["a/sibling.txt", bytes("4")],
  ]);
  const plan = planTreeMutation(current, new Map());
  assert.deepEqual(plan.removals, [
    "a/b/c/deep.txt",
    "a/b/mid.txt",
    "a/sibling.txt",
    "top.txt",
  ]);
});

test("checkPatchCollisions and unionRepositoryDocuments detect collisions and deduplicate identical patches", () => {
  const authorRes = createContributorId("a@x");
  assert.equal(authorRes.ok, true);
  if (!authorRes.ok) return;
  const author = authorRes.value;

  const v1 = createVersion([{ contributorId: author, revision: 1 }]);
  assert.equal(v1.ok, true);
  if (!v1.ok) return;

  const emptyV = createVersion([]);
  assert.equal(emptyV.ok, true);
  if (!emptyV.ok) return;

  const docA: RepositoryDocument = Object.freeze({
    format: 1,
    frontier: v1.value,
    patches: Object.freeze([
      {
        author,
        revision: 1,
        base: emptyV.value,
        message: "hello",
        changes: Object.freeze([{ type: "put" as const, path: "file.txt", content: "aGVsbG8=" }]),
      },
    ]),
  });

  const docBCollision: RepositoryDocument = Object.freeze({
    format: 1,
    frontier: v1.value,
    patches: Object.freeze([
      {
        author,
        revision: 1,
        base: emptyV.value,
        message: "different message",
        changes: Object.freeze([{ type: "put" as const, path: "file.txt", content: "d29ybGQ=" }]),
      },
    ]),
  });

  const collisionResult = checkPatchCollisions(docA, docBCollision);
  assert.equal(collisionResult.ok, false);
  if (!collisionResult.ok) {
    assert.equal(collisionResult.error.detail, "patch collision: a@x revision 1");
  }

  // Symmetric check
  const reverseCollision = checkPatchCollisions(docBCollision, docA);
  assert.equal(reverseCollision.ok, false);
  if (!reverseCollision.ok) {
    assert.equal(reverseCollision.error.detail, "patch collision: a@x revision 1");
  }

  // Identical duplicate: union succeeds and deduplicates
  const unionResult = unionRepositoryDocuments(docA, docA);
  assert.equal(unionResult.ok, true);
  if (unionResult.ok) {
    assert.equal(unionResult.value.patches.length, 1);
  }
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

test("revert to empty () deletes tracked files and authors additive patch", async () => {
  const cli = await createRealCli();
  try {
    assert.equal((await cli.run(["init"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"])).exitCode, 0);
    await cli.writeFile("file.txt", "contents\n");
    assert.equal((await cli.run(["commit", "add file"])).exitCode, 0);

    const reverted = await cli.run(["revert", "()"]);
    assert.deepEqual(reverted, { exitCode: 0, stdout: "(alice@example.com->2)\n", stderr: "" });
    await assert.rejects(cli.readFile("file.txt"));

    const log = await cli.run(["log"]);
    assert.match(log.stdout, /revert to \(\)/);
  } finally {
    await cli.cleanup();
  }
});

test("revert fails when target tree is already current", async () => {
  const cli = await createRealCli();
  try {
    assert.equal((await cli.run(["init"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"])).exitCode, 0);
    await cli.writeFile("file.txt", "contents\n");
    assert.equal((await cli.run(["commit", "add file"])).exitCode, 0);

    const outcome = await cli.run(["revert", "(alice@example.com->1)"]);
    assert.deepEqual(outcome, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: target tree is already current\n",
    });
  } finally {
    await cli.cleanup();
  }
});

test("revert fails on unknown version, dirty tree, and missing identity", async () => {
  const cli = await createRealCli();
  try {
    assert.equal((await cli.run(["init"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"])).exitCode, 0);
    await cli.writeFile("file.txt", "v1\n");
    assert.equal((await cli.run(["commit", "v1"])).exitCode, 0);

    // Unknown target version
    const unknown = await cli.run(["revert", "(bob@example.com->1)"]);
    assert.deepEqual(unknown, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: unknown version: (bob@example.com->1)\n",
    });

    // Dirty working tree
    await cli.writeFile("dirty.txt", "uncommitted\n");
    const dirty = await cli.run(["revert", "()"]);
    assert.deepEqual(dirty, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: working tree is dirty\n",
    });
    await cli.removeFile("dirty.txt");

    // Missing identity
    await cli.removeFile(".snap/config.json");
    const noId = await cli.run(["revert", "()"]);
    assert.deepEqual(noId, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: contributor.id is required; configure it locally or globally\n",
    });
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

test("cross-repository diff and merge refuse dot collisions without mutating repository", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    assert.equal((await cli.run(["init", "left"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "a@x"], left)).exitCode, 0);
    await cli.writeFile("left/file.txt", "local\n");
    assert.equal((await cli.run(["commit", "local"], left)).exitCode, 0);

    await fs.mkdir(path.join(right, ".snap"), { recursive: true });
    await cli.writeFile("right/file.txt", "remote\n");
    await cli.writeFile(
      "right/.snap/repository.json",
      JSON.stringify(
        {
          format: 1,
          frontier: [["a@x", 1]],
          patches: [
            {
              author: "a@x",
              revision: 1,
              base: [],
              message: "different",
              changes: [{ type: "text", path: "file.txt", edit: [{ insert: ["remote\n"] }] }],
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    const diffOutcome = await cli.run(["diff", "()", "(a@x->1)", "--repo", right], left);
    assert.deepEqual(diffOutcome, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: patch collision: a@x revision 1\n",
    });

    const mergeOutcome = await cli.run(["merge", right], left);
    assert.deepEqual(mergeOutcome, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: patch collision: a@x revision 1\n",
    });

    // Verify local repository was not mutated
    assert.equal(await cli.readFile("left/file.txt"), "local\n");
    const localRepo = JSON.parse(await cli.readFile("left/.snap/repository.json")) as { readonly patches: readonly { readonly message: string }[] };
    assert.equal(localRepo.patches[0]?.message, "local");
  } finally {
    await cli.cleanup();
  }
});

test("merge refuses dirty working tree without importing history", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    assert.equal((await cli.run(["init", "right"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "remote@x"], right)).exitCode, 0);
    await cli.writeFile("right/remote.txt", "remote\n");
    assert.equal((await cli.run(["commit", "remote"], right)).exitCode, 0);

    assert.equal((await cli.run(["init", "left"])).exitCode, 0);
    await cli.writeFile("left/dirty.txt", "dirty\n");

    const outcome = await cli.run(["merge", right], left);
    assert.deepEqual(outcome, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: working tree is dirty\n",
    });

    // Remote file was not materialized and repo frontier is still ()
    await assert.rejects(cli.readFile("left/remote.txt"));
    const localRepo = JSON.parse(await cli.readFile("left/.snap/repository.json")) as { readonly frontier: readonly unknown[] };
    assert.deepEqual(localRepo.frontier, []);
  } finally {
    await cli.cleanup();
  }
});

test("merge whole-file conflicts emits sorted net-new warnings and suppresses them on re-merge", async () => {
  const cli = await createRealCli();
  try {
    const base = path.join(cli.root, "base");
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");

    assert.equal((await cli.run(["init", "base"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "seed@x"], base)).exitCode, 0);
    await cli.writeFile("base/delete.txt", "base\n");
    await cli.writeFile("base/incompatible.txt", "base\n");
    await cli.writeFile("base/later-put.txt", "base\n");
    await cli.writeFile("base/identical.txt", "base\n");
    assert.equal((await cli.run(["commit", "base"], base)).exitCode, 0);

    await fs.cp(base, left, { recursive: true });
    await fs.cp(base, right, { recursive: true });

    assert.equal((await cli.run(["config", "contributor.id", "alice@x"], left)).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "bob@x"], right)).exitCode, 0);

    await cli.writeFile("left/delete.txt", "left\n");
    await cli.writeFile("left/incompatible.txt", "left text\n");
    // binary bytes
    await fs.writeFile(path.join(left, "later-put.txt"), Buffer.from([0, 1]));
    await cli.writeFile("left/identical.txt", "same\n");
    assert.equal((await cli.run(["commit", "left"], left)).exitCode, 0);

    await cli.removeFile("right/delete.txt");
    await fs.writeFile(path.join(right, "incompatible.txt"), Buffer.from([0, 255]));
    await cli.writeFile("right/later-put.txt", "right text\n");
    await cli.writeFile("right/identical.txt", "same\n");
    assert.equal((await cli.run(["commit", "right"], right)).exitCode, 0);

    const merged = await cli.run(["merge", right], left);
    assert.equal(merged.exitCode, 0);
    assert.equal(merged.stdout, "(alice@x->1,bob@x->1,seed@x->1)\n");
    assert.equal(
      merged.stderr,
      "warning: auto-resolved delete.txt: delete-wins\n" +
      "warning: auto-resolved incompatible.txt: put-wins\n" +
      "warning: auto-resolved later-put.txt: later-put-wins\n",
    );

    // Winner outcomes verified
    await assert.rejects(cli.readFile("left/delete.txt"));
    assert.deepEqual(await fs.readFile(path.join(left, "incompatible.txt")), Buffer.from([0, 255]));
    assert.deepEqual(await fs.readFile(path.join(left, "later-put.txt")), Buffer.from([0, 1]));
    assert.equal(await cli.readFile("left/identical.txt"), "same\n");

    // Re-merging the exact same operand emits NO warnings
    const remerge = await cli.run(["merge", right], left);
    assert.deepEqual(remerge, {
      exitCode: 0,
      stdout: "(alice@x->1,bob@x->1,seed@x->1)\n",
      stderr: "",
    });
  } finally {
    await cli.cleanup();
  }
});

test("merge namespace conflicts correctly materializes files and directories across both directions", async () => {
  const cli = await createRealCli();
  try {
    const ancestor = path.join(cli.root, "ancestor");
    const descendant = path.join(cli.root, "descendant");

    assert.equal((await cli.run(["init", "ancestor"])).exitCode, 0);
    assert.equal((await cli.run(["init", "descendant"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@x"], ancestor)).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "bob@x"], descendant)).exitCode, 0);

    await cli.writeFile("ancestor/a", "ancestor\n");
    await cli.writeFile("descendant/a/b", "descendant\n");

    assert.equal((await cli.run(["commit", "ancestor"], ancestor)).exitCode, 0);
    assert.equal((await cli.run(["commit", "descendant"], descendant)).exitCode, 0);

    const merged = await cli.run(["merge", descendant], ancestor);
    assert.equal(merged.exitCode, 0);
    assert.equal(merged.stderr, "warning: auto-resolved a/b: namespace-wins\n");

    assert.equal(await cli.readFile("ancestor/a"), "ancestor\n");
    await assert.rejects(cli.readFile("ancestor/a/b"));
  } finally {
    await cli.cleanup();
  }
});

test("merge writes a file over a pre-existing empty directory left in the working tree (SPEC.md §2: empty directories are not tracked)", async () => {
  const cli = await createRealCli();
  try {
    const local = path.join(cli.root, "local");
    const remote = path.join(cli.root, "remote");

    assert.equal((await cli.run(["init", "local"])).exitCode, 0);
    assert.equal((await cli.run(["init", "remote"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@x"], local)).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "bob@x"], remote)).exitCode, 0);

    await cli.writeFile("remote/docs", "remote content\n");
    assert.equal((await cli.run(["commit", "remote"], remote)).exitCode, 0);

    // `local` never tracked anything at "docs" -- this empty directory was
    // created out of band (e.g. by another tool) and, per SPEC.md §2, is not
    // a tracked working-tree entry, so it must not make the tree dirty and
    // must not block a merge from writing a file there.
    await fs.mkdir(path.join(local, "docs"));
    const status = await cli.run(["status"], local);
    assert.equal(status.exitCode, 0);
    assert.equal(status.stdout, "version ()\n");

    const merged = await cli.run(["merge", remote], local);
    assert.equal(merged.exitCode, 0);
    assert.equal(merged.stderr, "");
    assert.equal(await cli.readFile("local/docs"), "remote content\n");
  } finally {
    await cli.cleanup();
  }
});

test("cross-repository diff reports unknown versions and handles equal trees", async () => {
  const cli = await createRealCli();
  try {
    const local = path.join(cli.root, "local");
    const remote = path.join(cli.root, "remote");

    assert.equal((await cli.run(["init", "local"])).exitCode, 0);
    assert.equal((await cli.run(["init", "remote"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "a@x"], local)).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "b@x"], remote)).exitCode, 0);

    await cli.writeFile("local/note.txt", "same\n");
    await cli.writeFile("remote/note.txt", "same\n");

    assert.equal((await cli.run(["commit", "commit local"], local)).exitCode, 0);
    assert.equal((await cli.run(["commit", "commit remote"], remote)).exitCode, 0);

    // Unknown old version
    const unknownOld = await cli.run(["diff", "(c@x->1)", "(b@x->1)", "--repo", remote], local);
    assert.deepEqual(unknownOld, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: unknown version: (c@x->1)\n",
    });

    // Unknown new version in remote
    const unknownNew = await cli.run(["diff", "(a@x->1)", "(c@x->1)", "--repo", remote], local);
    assert.deepEqual(unknownNew, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: unknown version: (c@x->1)\n",
    });

    // Equal trees: no stdout, exit 0
    const equalDiff = await cli.run(["diff", "(a@x->1)", "(b@x->1)", "--repo", remote], local);
    assert.deepEqual(equalDiff, {
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  } finally {
    await cli.cleanup();
  }
});
