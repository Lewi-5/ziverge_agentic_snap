import test from "node:test";
import assert from "node:assert/strict";
import { validateMessage } from "../src/domain/repository/message.js";
import { createTrackedPath } from "../src/domain/tree/path.js";
import { parseCliArgs } from "../src/cli/grammar.js";
import { renderDiffPlain } from "../src/cli/render-diff-plain.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { DiffRecord } from "../src/domain/tree/diff-records.js";
import { createRealCli } from "./support/real-cli.js";

test("validateMessage rejects unpaired UTF-16 surrogates", () => {
  // Lone high surrogate
  const high = validateMessage("hello\uD800world");
  assert.equal(high.ok, false);
  if (!high.ok) {
    assert.equal(high.error.detail, "message contains an unpaired surrogate");
  }

  // Lone low surrogate
  const low = validateMessage("hello\uDC00world");
  assert.equal(low.ok, false);
  if (!low.ok) {
    assert.equal(low.error.detail, "message contains an unpaired surrogate");
  }

  // Valid paired surrogate (emoji 😀: U+1F600 = \uD83D\uDE00)
  const validEmoji = validateMessage("hello 😀 world");
  assert.equal(validEmoji.ok, true);
});

test("commit: rejects a message containing an unpaired surrogate via real CLI", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/a.txt", "content\n");

    const outcome = await cli.run(["commit", "bad\uD800message"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "snap: invalid commit message\n");

    const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json")) as {
      patches: readonly unknown[];
    };
    assert.equal(manifest.patches.length, 0);
  } finally {
    await cli.cleanup();
  }
});

test("createTrackedPath rejects unpaired UTF-16 surrogates", () => {
  const high = createTrackedPath("bad\uD800path");
  assert.equal(high.ok, false);
  if (!high.ok) {
    assert.ok(high.error.detail.includes("unpaired surrogate"));
  }

  const low = createTrackedPath("bad\uDC00path");
  assert.equal(low.ok, false);
  if (!low.ok) {
    assert.ok(low.error.detail.includes("unpaired surrogate"));
  }

  const valid = createTrackedPath("good😀path");
  assert.equal(valid.ok, true);
});

test("cli grammar rejects flags starting with '--' as unknown options", () => {
  const parsed = parseCliArgs(["commit", "--unknown-flag"]);
  assert.equal(parsed.ok, false);

  // Single hyphen or text messages are accepted
  const singleHyphen = parseCliArgs(["commit", "- fix bug"]);
  assert.equal(singleHyphen.ok, true);
  if (singleHyphen.ok && singleHyphen.value.kind === "commit") {
    assert.equal(singleHyphen.value.message, "- fix bug");
  }
});

test("commit: accepts a message with leading hyphen via real CLI", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/a.txt", "content\n");

    const outcome = await cli.run(["commit", "- fix bug in parser"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "(alice@example.com->1)\n");

    const log = await cli.run(["log"], `${cli.root}/repo`);
    assert.equal(log.stdout, "(alice@example.com->1)\talice@example.com\t- fix bug in parser\n");
  } finally {
    await cli.cleanup();
  }
});

test("log: multi-author serial commits render in reverse integration order, not storage order", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);

    // 1. Bob commits first
    await cli.run(["config", "contributor.id", "bob@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/bob.txt", "b1\n");
    await cli.run(["commit", "bob 1"], `${cli.root}/repo`);

    // 2. Alice commits second (alphabetically earlier than Bob, but later in history)
    await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/alice.txt", "a1\n");
    await cli.run(["commit", "alice 1"], `${cli.root}/repo`);

    // 3. Bob commits third
    await cli.run(["config", "contributor.id", "bob@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/bob.txt", "b2\n");
    await cli.run(["commit", "bob 2"], `${cli.root}/repo`);

    // Verify storage order in repository.json: Alice must precede Bob
    const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json")) as {
      patches: readonly { readonly author: string; readonly revision: number }[];
    };
    assert.equal(manifest.patches[0]?.author, "alice@example.com");
    assert.equal(manifest.patches[1]?.author, "bob@example.com");
    assert.equal(manifest.patches[2]?.author, "bob@example.com");

    // Verify log order: reverse integration order (Bob 2 -> Alice 1 -> Bob 1)
    const log = await cli.run(["log"], `${cli.root}/repo`);
    assert.equal(log.exitCode, 0);
    const lines = log.stdout.trim().split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0]?.includes("bob 2"));
    assert.ok(lines[1]?.includes("alice 1"));
    assert.ok(lines[2]?.includes("bob 1"));
  } finally {
    await cli.cleanup();
  }
});

test("scanner rejects missing file read from race condition instead of creating phantom empty file", async () => {
  const fakeFs: FileSystemPort = {
    entryKind: async (path) => (path.endsWith("raced.txt") ? "file" : "directory"),
    pathExists: async () => true,
    isDirectory: async (path) => !path.endsWith("raced.txt"),
    mkdirRecursive: async () => {},
    writeFile: async () => {},
    readFileIfExists: async () => null, // file was deleted right after entryKind!
    writeFileDurable: async () => {},
    renameFile: async () => {},
    removeFileIfExists: async () => {},
    listDirectory: async () => ["raced.txt"],
  };

  const scanner = createNodeWorkingTreeAdapter(fakeFs);
  const result = await scanner.scan("/virtual/repo");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "unsupported working tree entry: raced.txt");
  }
});

test("renderDiffPlain formats canonical 1-based hunk headers for creations and deletions", () => {
  const records: readonly DiffRecord[] = [
    {
      kind: "text",
      path: "created.txt",
      oldLabel: "/dev/null",
      newLabel: "b/created.txt",
      oldTokenCount: 0,
      newTokenCount: 1,
      lines: [{ kind: "insert", token: "new\n" }],
    },
    {
      kind: "text",
      path: "deleted.txt",
      oldLabel: "a/deleted.txt",
      newLabel: "/dev/null",
      oldTokenCount: 2,
      newTokenCount: 0,
      lines: [
        { kind: "delete", token: "old1\n" },
        { kind: "delete", token: "old2\n" },
      ],
    },
    {
      kind: "text",
      path: "empty.txt",
      oldLabel: "/dev/null",
      newLabel: "b/empty.txt",
      oldTokenCount: 0,
      newTokenCount: 0,
      lines: [],
    },
  ];

  const diffText = renderDiffPlain(records);
  // File created: old count 0 -> @@ -1,0 +1,1 @@
  assert.ok(diffText.includes("@@ -1,0 +1,1 @@"));
  // File deleted: new count 0 -> @@ -1,2 +1,0 @@
  assert.ok(diffText.includes("@@ -1,2 +1,0 @@"));
  // Empty file: both counts 0 -> @@ -1,0 +1,0 @@
  assert.ok(diffText.includes("@@ -1,0 +1,0 @@"));
});
