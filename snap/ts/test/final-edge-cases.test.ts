import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { formatVersion } from "../src/domain/version/format.js";
import { createVersion } from "../src/domain/version/construct.js";
import { isValidContributorId } from "../src/domain/version/contributor-id.js";
import { validateMessage } from "../src/domain/repository/message.js";
import { buildDiffRecords } from "../src/domain/tree/diff-records.js";
import { renderDiffPlain } from "../src/cli/render-diff-plain.js";
import { renderDiffTerminal } from "../src/cli/render-terminal.js";
import { compareTrees } from "../src/domain/tree/compare.js";
import { renderCommandResult } from "../src/cli/render.js";
import { commit } from "../src/application/commands/commit.js";
import { revert } from "../src/application/commands/revert.js";
import { merge } from "../src/application/commands/merge.js";
import { diffAcrossRepositories } from "../src/application/commands/diff.js";
import { createRepositorySourceAdapter } from "../src/application/repository/create-repository-source.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import { createNodeTreeMaterializationAdapter } from "../src/adapters/node-tree-materialization-adapter.js";
import type { HttpClientPort, HttpResponse } from "../src/ports/http-client-port.js";
import type { RepositoryDocument } from "../src/domain/repository/types.js";
import type { Version } from "../src/domain/version/types.js";

function fakeHttpClient(respond: (url: string) => HttpResponse): HttpClientPort {
  return {
    async get(url: string): Promise<HttpResponse> {
      return respond(url);
    },
  };
}

const textEncoder = new TextEncoder();

function v(components: readonly { readonly contributorId: string; readonly revision: number }[]): Version {
  const res = createVersion(components);
  if (!res.ok) {
    throw new Error(`Invalid test version: ${res.error.detail}`);
  }
  return res.value;
}

async function createTestRepo(root: string, document: RepositoryDocument): Promise<void> {
  const snapDir = path.join(root, ".snap");
  await fs.mkdir(snapDir, { recursive: true });
  await fs.writeFile(
    path.join(snapDir, "repository.json"),
    JSON.stringify(
      {
        format: document.format,
        frontier: document.frontier.components.map((c) => [c.contributorId, c.revision]),
        patches: document.patches.map((p) => ({
          author: p.author,
          revision: p.revision,
          base: p.base.components.map((c) => [c.contributorId, c.revision]),
          message: p.message,
          changes: p.changes,
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

function makeAdapters(env: Record<string, string> = {}): {
  readonly fileSystem: ReturnType<typeof createNodeFileSystemAdapter>;
  readonly repositoryDiscovery: ReturnType<typeof createNodeRepositoryDiscoveryAdapter>;
  readonly environment: ReturnType<typeof createNodeEnvironmentAdapter>;
  readonly workingTree: ReturnType<typeof createNodeWorkingTreeAdapter>;
  readonly treeMaterialization: ReturnType<typeof createNodeTreeMaterializationAdapter>;
} {
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const environment = createNodeEnvironmentAdapter(env);
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);
  const treeMaterialization = createNodeTreeMaterializationAdapter();
  return { fileSystem, repositoryDiscovery, environment, workingTree, treeMaterialization };
}

// ---------------------------------------------------------------------------
// 1. Long revert message (> 4096 bytes, SPEC §4.2)
// ---------------------------------------------------------------------------

test("1. revert message with many contributors can exceed 4096 bytes without error", () => {
  // Construct a version with ~150 contributors so that "revert to (...)" > 4096 bytes
  const components = [];
  for (let i = 0; i < 150; i += 1) {
    const id = `contributor-${String(i).padStart(4, "0")}@example.com`;
    components.push({ contributorId: id, revision: 1 });
  }
  const versionRes = createVersion(components);
  assert.equal(versionRes.ok, true);
  if (!versionRes.ok) return;

  const version = versionRes.value;
  const versionText = formatVersion(version);
  const revertMessage = `revert to ${versionText}`;
  assert.ok(textEncoder.encode(revertMessage).length > 4096, "revert message must exceed 4096 bytes");

  // validateMessage without maxBytes (as revert uses it) must succeed
  const validated = validateMessage(revertMessage);
  assert.equal(validated.ok, true);

  // But validateMessage with commit's 4096 byte cap must reject it
  const commitCapped = validateMessage(revertMessage, { maxBytes: 4096 });
  assert.equal(commitCapped.ok, false);
});

// ---------------------------------------------------------------------------
// 2. Commit message control-character edge cases (SPEC §4.2, §7.5)
// ---------------------------------------------------------------------------

test("2. commit message rejects control characters other than tab and LF", () => {
  // CR is rejected
  assert.equal(validateMessage("hello\r\nworld").ok, false);
  // NUL is rejected
  assert.equal(validateMessage("hello\0world").ok, false);
  // ESC is rejected
  assert.equal(validateMessage("hello\x1bworld").ok, false);
  // DEL is rejected
  assert.equal(validateMessage("hello\x7fworld").ok, false);

  // Tab and LF are accepted
  assert.equal(validateMessage("hello\tworld\n").ok, true);
});

test("2. commit: invalid message is rejected even on a clean tree (precedence)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-commit-prec-"));
  try {
    const adapters = makeAdapters();
    await createTestRepo(root, {
      format: 1,
      frontier: v([{ contributorId: "alice@example.com", revision: 1 }]),
      patches: [
        {
          author: "alice@example.com" as any,
          revision: 1,
          base: v([]),
          message: "init",
          changes: [{ type: "text", path: "a.txt" as any, edit: [{ insert: ["init\n"] }] }],
        },
      ],
    });
    // Create local config
    await fs.writeFile(path.join(root, ".snap", "config.json"), '{"contributor":{"id":"alice@example.com"}}\n', "utf8");
    // Make working tree clean by matching the commit
    await fs.writeFile(path.join(root, "a.txt"), "init\n", "utf8");

    // Invalid message on clean tree: must return invalid commit message, NOT working tree is clean
    const outcome = await commit({ cwd: root, message: "bad\r\nmessage" }, adapters);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.error.detail, "invalid commit message");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Diff hunk formatting for empty and 0-token boundaries (SPEC §7.6)
// ---------------------------------------------------------------------------

test("3. diff: hunk headers for empty files and single token files follow exact SPEC syntax", () => {
  const emptyTree = new Map<string, Uint8Array>();
  const oneTokenTree = new Map<string, Uint8Array>([["file.txt", textEncoder.encode("hello\n")]]);
  const emptyFileTree = new Map<string, Uint8Array>([["empty.txt", textEncoder.encode("")]]);

  // Addition of one-token file from absent
  const addRecords = buildDiffRecords(emptyTree, oneTokenTree);
  assert.equal(addRecords.length, 1);
  assert.equal(addRecords[0]?.kind, "text");
  if (addRecords[0]?.kind === "text") {
    assert.equal(addRecords[0].oldTokenCount, 0);
    assert.equal(addRecords[0].newTokenCount, 1);
  }
  const plainAdd = renderDiffPlain(addRecords);
  assert.match(plainAdd, /@@ -1,0 \+1,1 @@/);

  // Deletion of one-token file to absent
  const delRecords = buildDiffRecords(oneTokenTree, emptyTree);
  const plainDel = renderDiffPlain(delRecords);
  assert.match(plainDel, /@@ -1,1 \+1,0 @@/);

  // Creation of empty file from absent
  const emptyRecords = buildDiffRecords(emptyTree, emptyFileTree);
  const plainEmpty = renderDiffPlain(emptyRecords);
  assert.match(plainEmpty, /@@ -1,0 \+1,0 @@/);

  // Terminal rendering preserves identical structure
  const termAdd = renderDiffTerminal(addRecords);
  assert.match(termAdd, /@@ -1,0 \+1,1 @@/);
});

// ---------------------------------------------------------------------------
// 4. Revert precedence: dirty tree vs. target already current (SPEC §7.7, §10)
// ---------------------------------------------------------------------------

test("4. revert: dirty tree error takes precedence over target-tree-is-already-current", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-revert-prec-"));
  try {
    const adapters = makeAdapters();
    const ver = v([{ contributorId: "alice@example.com", revision: 1 }]);
    await createTestRepo(root, {
      format: 1,
      frontier: ver,
      patches: [
        {
          author: "alice@example.com" as any,
          revision: 1,
          base: v([]),
          message: "first",
          changes: [{ type: "text", path: "a.txt" as any, edit: [{ insert: ["content\n"] }] }],
        },
      ],
    });
    await fs.writeFile(path.join(root, ".snap", "config.json"), '{"contributor":{"id":"alice@example.com"}}\n', "utf8");
    // Write target content but add a dirty uncommitted file
    await fs.writeFile(path.join(root, "a.txt"), "content\n", "utf8");
    await fs.writeFile(path.join(root, "dirty.txt"), "untracked\n", "utf8");

    // Target tree equals current tree, BUT working tree is dirty
    const outcome = await revert(root, "(alice@example.com->1)", adapters);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.error.detail, "working tree is dirty");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Revert precedence: invalid/unknown version on dirty tree (SPEC §7.7)
// ---------------------------------------------------------------------------

test("5. revert: invalid or unknown version is rejected before checking dirty tree", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-revert-unk-"));
  try {
    const adapters = makeAdapters();
    const ver = v([{ contributorId: "alice@example.com", revision: 1 }]);
    await createTestRepo(root, {
      format: 1,
      frontier: ver,
      patches: [
        {
          author: "alice@example.com" as any,
          revision: 1,
          base: v([]),
          message: "first",
          changes: [{ type: "text", path: "a.txt" as any, edit: [{ insert: ["content\n"] }] }],
        },
      ],
    });
    await fs.writeFile(path.join(root, ".snap", "config.json"), '{"contributor":{"id":"alice@example.com"}}\n', "utf8");
    // Dirty working tree
    await fs.writeFile(path.join(root, "dirty.txt"), "dirty\n", "utf8");

    // Invalid syntax
    const invalidSyntax = await revert(root, "not-a-version", adapters);
    assert.equal(invalidSyntax.ok, false);
    if (!invalidSyntax.ok) {
      assert.match(invalidSyntax.error.detail, /invalid version/);
    }

    // Unknown version
    const unknownVersion = await revert(root, "(alice@example.com->99)", adapters);
    assert.equal(unknownVersion.ok, false);
    if (!unknownVersion.ok) {
      assert.equal(unknownVersion.error.detail, "unknown version: (alice@example.com->99)");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Contributor ID validation boundaries (SPEC §3.1)
// ---------------------------------------------------------------------------

test("6. contributor id: accepts plus tags, numbers, and dots; rejects non-ASCII and whitespace", () => {
  assert.equal(isValidContributorId("user+tag@domain.com"), true);
  assert.equal(isValidContributorId("123@456.co"), true);
  assert.equal(isValidContributorId("first.last_name@sub.domain.org"), true);

  // Non-ASCII rejected
  assert.equal(isValidContributorId("üser@example.com"), false);
  // Whitespace rejected
  assert.equal(isValidContributorId("user @example.com"), false);
  assert.equal(isValidContributorId(" user@example.com"), false);
  // Commas, parens, arrow substring rejected
  assert.equal(isValidContributorId("user,name@example.com"), false);
  assert.equal(isValidContributorId("user(name)@example.com"), false);
  assert.equal(isValidContributorId("user->name@example.com"), false);
});

// ---------------------------------------------------------------------------
// 7. Merge winner rule 6: put-wins (SPEC §6.4)
// ---------------------------------------------------------------------------

test("7. merge: rule 6 put-wins when incoming text change meets current non-text binary", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-merge-rule6-"));
  try {
    const adapters = makeAdapters();
    // Common base: root@x creates text file doc.txt
    const basePatch = {
      author: "root@x" as any,
      revision: 1,
      base: v([]),
      message: "base",
      changes: [{ type: "text", path: "doc.txt" as any, edit: [{ insert: ["base content\n"] }] }],
    };

    // Branch A (local): replaces doc.txt with binary (put) by bob@x
    const binaryBytes = new Uint8Array([0x00, 0xff, 0xfe]);
    const localPatch = {
      author: "bob@x" as any,
      revision: 1,
      base: v([{ contributorId: "root@x", revision: 1 }]),
      message: "binary replacement",
      changes: [{ type: "put", path: "doc.txt" as any, content: "AP/+" }],
    };

    // Branch B (remote): edits doc.txt as text by alice@x
    const remotePatch = {
      author: "alice@x" as any,
      revision: 1,
      base: v([{ contributorId: "root@x", revision: 1 }]),
      message: "text edit",
      changes: [{ type: "text", path: "doc.txt" as any, edit: [{ delete: 1 }, { insert: ["updated text\n"] }] }],
    };

    // Setup local repo on branch A
    await createTestRepo(root, {
      format: 1,
      frontier: v([
        { contributorId: "bob@x", revision: 1 },
        { contributorId: "root@x", revision: 1 },
      ]),
      patches: [localPatch, basePatch].sort((a, b) => a.author.localeCompare(b.author)) as any,
    });
    // Write working tree matching local state
    await fs.writeFile(path.join(root, "doc.txt"), binaryBytes);

    // Setup remote repo JSON on branch B
    const remoteDoc = JSON.stringify({
      format: 1,
      frontier: [["alice@x", 1], ["root@x", 1]],
      patches: [
        { author: "alice@x", revision: 1, base: [["root@x", 1]], message: "text edit", changes: remotePatch.changes },
        { author: "root@x", revision: 1, base: [], message: "base", changes: basePatch.changes },
      ],
    });

    const httpClient = fakeHttpClient(() => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: textEncoder.encode(remoteDoc),
    }));
    const repositorySource = createRepositorySourceAdapter(adapters.fileSystem, httpClient);

    // Merge remote (alice's text edit) into local (bob's binary put):
    // Snap order:
    // bob@x result: (bob@x->1, root@x->1)
    // alice@x result: (alice@x->1, root@x->1)
    // At first unequal contributor "alice@x": bob has 0, alice has 1.
    // Therefore bob@x < alice@x in Snap order, so bob's binary put integrates first.
    // Then alice's text edit arrives. By rule 6, current binary wins! (put-wins)
    const result = await merge(root, "http://example.invalid/repository.json", {
      ...adapters,
      repositorySource,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.warnings.length, 1);
      assert.equal(result.value.warnings[0]?.path, "doc.txt");
      assert.equal(result.value.warnings[0]?.reason, "put-wins");
    }

    // Working tree file must still be the binary content
    const diskBytes = await fs.readFile(path.join(root, "doc.txt"));
    assert.deepEqual(diskBytes, Buffer.from(binaryBytes));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. Merge identical concurrent binary additions (SPEC §6.4 rule 1)
// ---------------------------------------------------------------------------

test("8. merge: identical concurrent binary creations collapse without warning", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-merge-ident-bin-"));
  try {
    const adapters = makeAdapters();
    // Local adds binary.bin with content AAEC
    const localPatch = {
      author: "alice@x" as any,
      revision: 1,
      base: v([]),
      message: "add binary",
      changes: [{ type: "put", path: "binary.bin" as any, content: "AAEC" }],
    };
    await createTestRepo(root, {
      format: 1,
      frontier: v([{ contributorId: "alice@x", revision: 1 }]),
      patches: [localPatch] as any,
    });
    await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));

    // Remote concurrently adds binary.bin with the exact same content AAEC
    const remoteDoc = JSON.stringify({
      format: 1,
      frontier: [["bob@x", 1]],
      patches: [
        { author: "bob@x", revision: 1, base: [], message: "add same binary", changes: [{ type: "put", path: "binary.bin", content: "AAEC" }] },
      ],
    });

    const httpClient = fakeHttpClient(() => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: textEncoder.encode(remoteDoc),
    }));
    const repositorySource = createRepositorySourceAdapter(adapters.fileSystem, httpClient);

    const result = await merge(root, "http://example.invalid/repository.json", {
      ...adapters,
      repositorySource,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.warnings.length, 0, "identical changes must emit no warning");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 9. Status sorting by unsigned UTF-8 path across codes (SPEC §7.3)
// ---------------------------------------------------------------------------

test("9. status: rows sort strictly by unsigned UTF-8 path bytes regardless of code", () => {
  const current = new Map<string, Uint8Array>([
    ["Z_uppercase.txt", textEncoder.encode("old\n")],
    ["a_deleted.txt", textEncoder.encode("old\n")],
  ]);
  const working = new Map<string, Uint8Array>([
    ["Z_uppercase.txt", textEncoder.encode("modified\n")], // M
    ["b_added.txt", textEncoder.encode("new\n")],         // A
    // a_deleted.txt is omitted -> D
  ]);

  const rows = compareTrees(current, working);
  assert.equal(rows.length, 3);
  // 'Z' (0x5A) < 'a' (0x61) < 'b' (0x62)
  assert.equal(rows[0]?.path, "Z_uppercase.txt");
  assert.equal(rows[0]?.code, "M");
  assert.equal(rows[1]?.path, "a_deleted.txt");
  assert.equal(rows[1]?.code, "D");
  assert.equal(rows[2]?.path, "b_added.txt");
  assert.equal(rows[2]?.code, "A");

  const rendered = renderCommandResult({
    kind: "status",
    version: v([]),
    rows,
  });
  assert.equal(
    rendered,
    "version ()\nM Z_uppercase.txt\nD a_deleted.txt\nA b_added.txt\n",
  );
});

// ---------------------------------------------------------------------------
// 10. Cross-repository diff with identical trees (SPEC §7.6)
// ---------------------------------------------------------------------------

test("10. diff across repositories with different frontiers but identical trees produces no output", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-diff-ident-"));
  try {
    const adapters = makeAdapters();
    // Local repo: alice created file.txt
    await createTestRepo(root, {
      format: 1,
      frontier: v([{ contributorId: "alice@x", revision: 1 }]),
      patches: [
        {
          author: "alice@x" as any,
          revision: 1,
          base: v([]),
          message: "local file",
          changes: [{ type: "text", path: "file.txt" as any, edit: [{ insert: ["same content\n"] }] }],
        },
      ],
    });

    // Remote repo: bob created file.txt with identical content
    const remoteDoc = JSON.stringify({
      format: 1,
      frontier: [["bob@x", 1]],
      patches: [
        {
          author: "bob@x",
          revision: 1,
          base: [],
          message: "remote file",
          changes: [{ type: "text", path: "file.txt", edit: [{ insert: ["same content\n"] }] }],
        },
      ],
    });

    const httpClient = fakeHttpClient(() => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: textEncoder.encode(remoteDoc),
    }));
    const repositorySource = createRepositorySourceAdapter(adapters.fileSystem, httpClient);

    const outcome = await diffAcrossRepositories(
      root,
      "(alice@x->1)",
      "(bob@x->1)",
      "http://example.invalid/repository.json",
      { fileSystem: adapters.fileSystem, repositoryDiscovery: adapters.repositoryDiscovery, repositorySource },
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.value.length, 0, "diff records must be empty");
      const rendered = renderDiffPlain(outcome.value);
      assert.equal(rendered, "", "rendered plain diff must be empty string");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
