import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";

test("diff: no changes produces empty stdout and success", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const outcome = await cli.run(["diff"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "");
  } finally {
    await cli.cleanup();
  }
});

test("diff: repeated-line edits and missing final newlines render the exact scenario 05 golden", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "a@x"], `${cli.root}/repo`);
    await cli.writeFile("repo/repeated.txt", "a\nb\na\n");
    await cli.run(["commit", "old"], `${cli.root}/repo`);
    await cli.writeFile("repo/repeated.txt", "b\na\na");
    await cli.writeFile("repo/added.txt", "new");

    const outcome = await cli.run(["diff"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(
      outcome.stdout,
      "--- /dev/null\n+++ b/added.txt\n@@ -1,0 +1,1 @@\n+new\n\\ No newline at end of file\n" +
        "--- a/repeated.txt\n+++ b/repeated.txt\n@@ -1,3 +1,3 @@\n-a\n b\n a\n+a\n\\ No newline at end of file\n",
    );
    assert.equal(outcome.stderr, "");

    await cli.run(["commit", "new"], `${cli.root}/repo`);
    const historical = await cli.run(["diff", "(a@x->1)", "(a@x->2)"], `${cli.root}/repo`);
    assert.equal(historical.exitCode, 0);
    assert.equal(historical.stdout, outcome.stdout);

    const noDiff = await cli.run(["diff", "(a@x->2)", "(a@x->2)"], `${cli.root}/repo`);
    assert.equal(noDiff.exitCode, 0);
    assert.equal(noDiff.stdout, "");
  } finally {
    await cli.cleanup();
  }
});

test("diff: binary and empty files render the exact scenario 06 golden", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "binary@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/empty", "");
    const fs = await import("node:fs/promises");
    await fs.writeFile(`${cli.root}/repo/data.bin`, Buffer.from("AP+AQUI=", "base64"));

    const outcome = await cli.run(["diff"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "Binary files /dev/null and b/data.bin differ\n--- /dev/null\n+++ b/empty\n@@ -1,0 +1,0 @@\n");

    await cli.run(["commit", "bytes"], `${cli.root}/repo`);
    await cli.removeFile("repo/data.bin");
    const afterDelete = await cli.run(["diff"], `${cli.root}/repo`);
    assert.equal(afterDelete.exitCode, 0);
    assert.equal(afterDelete.stdout, "Binary files a/data.bin and /dev/null differ\n");
  } finally {
    await cli.cleanup();
  }
});

test("diff: an invalid version fails with 'invalid version: ...', matching scenario 25's exact pattern", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const cases = ["(good@x->0)", "(good@x->-1)", "(good@x->9007199254740992)", "(b@x->1,a@x->1)", "(a@x->1, b@x->1)"];
    for (const badVersion of cases) {
      const outcome = await cli.run(["diff", badVersion, "()"], `${cli.root}/repo`);
      assert.equal(outcome.exitCode, 1, `expected failure for ${badVersion}`);
      assert.equal(outcome.stdout, "");
      assert.match(outcome.stderr, /^snap: invalid version: .+\n$/);
    }
  } finally {
    await cli.cleanup();
  }
});

test("diff: a syntactically valid but unknown version fails with 'unknown version: ...'", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const outcome = await cli.run(["diff", "(nobody@example.com->1)", "()"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "snap: unknown version: (nobody@example.com->1)\n");
  } finally {
    await cli.cleanup();
  }
});

test("diff: an unsupported working tree entry fails the no-argument form", async (context) => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const fs = await import("node:fs/promises");
    try {
      await fs.symlink("missing-target", `${cli.root}/repo/link`);
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }
    const outcome = await cli.run(["diff"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "snap: unsupported working tree entry: link\n");
  } finally {
    await cli.cleanup();
  }
});

test("diff: three or more arguments is a grammar error", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const outcome = await cli.run(["diff", "()", "()", "()"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stderr, "snap: invalid command or arguments\n");
  } finally {
    await cli.cleanup();
  }
});
