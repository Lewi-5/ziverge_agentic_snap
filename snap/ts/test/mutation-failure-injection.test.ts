import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { merge } from "../src/application/commands/merge.js";
import { revert } from "../src/application/commands/revert.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeHttpClientAdapter } from "../src/adapters/node-http-client-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import { createRepositorySourceAdapter } from "../src/application/repository/create-repository-source.js";
import type { TreeMaterializationPort } from "../src/ports/tree-materialization-port.js";
import type { TreeMutationPlan } from "../src/domain/tree/mutation-plan.js";
import { createRealCli } from "./support/real-cli.js";

/**
 * PLAN.md's M9 hardening work requires proving §10's boundary end-to-end, not
 * just at metadata publication (already covered by test/repository-publication.test.ts):
 * an I/O failure partway through a multi-file merge/revert *working-tree* apply
 * may leave the working tree partially updated, but must never let publication
 * of `repository.json` run at all, so the old metadata stays byte-for-byte
 * published and the command fails. These tests call `merge`/`revert` directly
 * with the real Node adapters for everything except a deliberately failing
 * `TreeMaterializationPort`, so the injected failure exercises the exact
 * production call sequence (`apply` before `publishRepository`, no try/catch
 * between them) rather than a mock of it.
 */

function failAfterWrites(count: number): TreeMaterializationPort {
  return {
    async apply(repositoryRoot: string, plan: TreeMutationPlan): Promise<void> {
      for (const trackedPath of plan.removals) {
        await fs.unlink(path.join(repositoryRoot, ...trackedPath.split("/")));
      }
      let applied = 0;
      for (const write of plan.writes) {
        if (applied >= count) throw new Error(`simulated failure after ${String(count)} write(s)`);
        const target = path.join(repositoryRoot, ...write.path.split("/"));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, write.bytes);
        applied += 1;
      }
    },
  };
}

function failBeforeRemovals(): TreeMaterializationPort {
  return {
    apply(): Promise<void> {
      throw new Error("simulated failure removing an obsolete path");
    },
  };
}

async function mergePorts(treeMaterialization: TreeMaterializationPort) {
  const fileSystem = createNodeFileSystemAdapter();
  return {
    fileSystem,
    repositoryDiscovery: createNodeRepositoryDiscoveryAdapter(fileSystem),
    workingTree: createNodeWorkingTreeAdapter(fileSystem),
    treeMaterialization,
    repositorySource: createRepositorySourceAdapter(fileSystem, createNodeHttpClientAdapter()),
  };
}

async function revertPorts(treeMaterialization: TreeMaterializationPort, home: string) {
  const fileSystem = createNodeFileSystemAdapter();
  return {
    fileSystem,
    repositoryDiscovery: createNodeRepositoryDiscoveryAdapter(fileSystem),
    workingTree: createNodeWorkingTreeAdapter(fileSystem),
    environment: createNodeEnvironmentAdapter({ HOME: home }),
    treeMaterialization,
  };
}

test("merge: a failure on the second working-tree write leaves repository.json byte-unchanged despite a partial apply", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    assert.equal((await cli.run(["init", "left"])).exitCode, 0);
    await cli.writeFile("left/base.txt", "base\n");
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"], left)).exitCode, 0);
    assert.equal((await cli.run(["commit", "base"], left)).exitCode, 0);

    await fs.cp(left, right, { recursive: true });
    assert.equal((await cli.run(["config", "contributor.id", "bob@example.com"], right)).exitCode, 0);
    await cli.writeFile("right/bob-one.txt", "one\n");
    await cli.writeFile("right/bob-two.txt", "two\n");
    assert.equal((await cli.run(["commit", "bob adds two files"], right)).exitCode, 0);

    const metadataBefore = await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8");

    const ports = await mergePorts(failAfterWrites(1));
    await assert.rejects(merge(left, right, ports), /simulated failure after 1 write/);

    // Publication never ran: the old metadata is byte-for-byte unchanged.
    const metadataAfter = await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8");
    assert.equal(metadataAfter, metadataBefore);

    // The working tree may be partially updated (SPEC §10) - exactly one of the
    // two new files landed before the injected failure, proving the apply loop
    // really ran against the real filesystem rather than being a no-op mock.
    const oneExists = await fs.readFile(path.join(left, "bob-one.txt"), "utf8").then(() => true, () => false);
    const twoExists = await fs.readFile(path.join(left, "bob-two.txt"), "utf8").then(() => true, () => false);
    assert.equal(oneExists && !twoExists, true, "expected exactly one of the two writes to have landed");

    // The partial write left an untracked file, so the working tree is now
    // dirty relative to local's still-unchanged frontier (SPEC §2/§10: a
    // partially updated working tree, old metadata, no hidden rollback). A
    // literal retry of merge must therefore refuse rather than silently
    // resume - the user's recovery path is to reconcile that file, not to
    // expect merge to pick up mid-apply.
    const dirtyRetry = await merge(left, right, await mergePorts(failAfterWrites(2)));
    assert.equal(dirtyRetry.ok, false);

    // Removing the partial artifact restores a clean tree, and merge then
    // succeeds normally: the earlier failure did not leave the repository
    // permanently unusable.
    await fs.rm(path.join(left, "bob-one.txt"));
    const retried = await merge(left, right, await mergePorts(failAfterWrites(2)));
    assert.equal(retried.ok, true);
  } finally {
    await cli.cleanup();
  }
});

test("merge: a failure removing an obsolete path leaves repository.json byte-unchanged", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    assert.equal((await cli.run(["init", "left"])).exitCode, 0);
    await cli.writeFile("left/keep.txt", "keep\n");
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"], left)).exitCode, 0);
    assert.equal((await cli.run(["commit", "base"], left)).exitCode, 0);

    await fs.cp(left, right, { recursive: true });
    assert.equal((await cli.run(["config", "contributor.id", "bob@example.com"], right)).exitCode, 0);
    await cli.removeFile("right/keep.txt");
    assert.equal((await cli.run(["commit", "bob deletes keep.txt"], right)).exitCode, 0);

    const metadataBefore = await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8");

    const ports = await mergePorts(failBeforeRemovals());
    await assert.rejects(merge(left, right, ports), /simulated failure removing an obsolete path/);

    const metadataAfter = await fs.readFile(path.join(left, ".snap", "repository.json"), "utf8");
    assert.equal(metadataAfter, metadataBefore);
    assert.equal(await fs.readFile(path.join(left, "keep.txt"), "utf8"), "keep\n");
  } finally {
    await cli.cleanup();
  }
});

test("revert: a failure during target-tree materialization leaves repository.json and history unchanged", async () => {
  const cli = await createRealCli();
  try {
    const repo = path.join(cli.root, "repo");
    assert.equal((await cli.run(["init", "repo"])).exitCode, 0);
    assert.equal((await cli.run(["config", "contributor.id", "alice@example.com"], repo)).exitCode, 0);
    await cli.writeFile("repo/one.txt", "one\n");
    assert.equal((await cli.run(["commit", "first"], repo)).exitCode, 0);
    await cli.writeFile("repo/two.txt", "two\n");
    assert.equal((await cli.run(["commit", "second"], repo)).exitCode, 0);
    await cli.writeFile("repo/one.txt", "one-changed\n");
    assert.equal((await cli.run(["commit", "third"], repo)).exitCode, 0);

    const metadataBefore = await fs.readFile(path.join(repo, ".snap", "repository.json"), "utf8");

    // Reverting to revision 1 both removes two.txt and rewrites one.txt back
    // to its original content, so failing before any write still exercises a
    // real (non-empty) plan rather than short-circuiting on an empty one.
    const ports = await revertPorts(failAfterWrites(0), cli.home);
    await assert.rejects(revert(repo, "(alice@example.com->1)", ports), /simulated failure after 0 write/);
    assert.equal(await fs.readFile(path.join(repo, "one.txt"), "utf8"), "one-changed\n");

    const metadataAfter = await fs.readFile(path.join(repo, ".snap", "repository.json"), "utf8");
    assert.equal(metadataAfter, metadataBefore);

    const log = await cli.run(["log"], repo);
    const entries = log.stdout.split("\n").filter((line) => line.length > 0);
    assert.equal(entries.length, 3, "expected exactly the original three log entries, no new revert patch");
  } finally {
    await cli.cleanup();
  }
});

test("merge: an unexpected validation failure (dot collision) touches no materialization or publication port", async () => {
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
      `${JSON.stringify({
        format: 1,
        frontier: [["a@x", 1]],
        patches: [{
          author: "a@x", revision: 1, base: [], message: "different",
          changes: [{ type: "text", path: "file.txt", edit: [{ insert: ["remote\n"] }] }],
        }],
      }, null, 2)}\n`,
    );

    let materializationCalls = 0;
    const spyMaterialization: TreeMaterializationPort = {
      async apply(): Promise<void> {
        materializationCalls += 1;
      },
    };
    const ports = await mergePorts(spyMaterialization);
    const result = await merge(left, right, ports);
    assert.equal(result.ok, false);
    assert.equal(materializationCalls, 0, "a validation failure must never reach tree materialization");
  } finally {
    await cli.cleanup();
  }
});
