import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { runCli } from "../src/cli/dispatch.js";
import type { CliPorts } from "../src/cli/types.js";
import { createRealCli } from "./support/real-cli.js";
import { createNodeTreeMaterializationAdapter } from "../src/adapters/node-tree-materialization-adapter.js";
import { diffAcrossRepositories } from "../src/application/commands/diff.js";
import { loadLocalOperand } from "../src/application/repository/load-local-operand.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../src/ports/repository-discovery-port.js";
import type { RepositorySourcePort } from "../src/ports/repository-source-port.js";

const GRAMMAR_ERROR_LINE = "snap: invalid command or arguments\n";
const CWD = path.parse(process.cwd()).root;

function throwingPorts(): CliPorts {
  const fail = (): never => {
    throw new Error("ports must not be touched for a rejected grammar shape");
  };
  return {
    fileSystem: {
      entryKind: fail,
      pathExists: fail,
      isDirectory: fail,
      mkdirRecursive: fail,
      writeFile: fail,
      readFileIfExists: fail,
      writeFileDurable: fail,
      renameFile: fail,
      removeFileIfExists: fail,
      listDirectory: fail,
    },
    repositoryDiscovery: { findRepositoryRoot: fail },
    environment: {
      getEnv: (name: string) => {
        if (name === "SNAP_COLOR" || name === "NO_COLOR") return undefined;
        return fail();
      },
    },
    workingTree: { scan: fail },
  };
}

// ---------------------------------------------------------------------------
// 1. CLI Dispatch Grammar Enforcement: commit and config
// ---------------------------------------------------------------------------

test("commit: rejects '--unknown' option before touching ports", async () => {
  const outcome = await runCli({ argv: ["commit", "--unknown"], cwd: CWD, ports: throwingPorts() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("commit: rejects '--help' option before touching ports", async () => {
  const outcome = await runCli({ argv: ["commit", "--help"], cwd: CWD, ports: throwingPorts() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("commit: real CLI in dirty repository does not commit with '--unknown' flag as message", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
    await cli.writeFile("repo/file.txt", "dirty\n");

    const outcome = await cli.run(["commit", "--unknown-flag"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);

    const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json")) as {
      patches: readonly unknown[];
    };
    assert.equal(manifest.patches.length, 0);
  } finally {
    await cli.cleanup();
  }
});

test("config: rejects misplaced '--global' operand without touching ports", async () => {
  const outcome = await runCli({
    argv: ["config", "contributor.id", "--global"],
    cwd: CWD,
    ports: throwingPorts(),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("config: rejects '--unknown' operand value without touching ports", async () => {
  const outcome = await runCli({
    argv: ["config", "contributor.id", "--unknown"],
    cwd: CWD,
    ports: throwingPorts(),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("config: real CLI rejects misplaced '--global' with grammar error not contributor error", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const outcome = await cli.run(["config", "contributor.id", "--global"], `${cli.root}/repo`);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
  } finally {
    await cli.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 2. Tree Materialization Adapter: Root Path Prefix Handling
// ---------------------------------------------------------------------------

test("node tree materialization adapter handles root paths with trailing separator", async () => {
  const adapter = createNodeTreeMaterializationAdapter();
  // An empty plan on a root-like path should succeed without throwing "tracked path escapes repository"
  await adapter.apply(path.parse(process.cwd()).root, { removals: [], writes: [] });
});

// ---------------------------------------------------------------------------
// 3. Cross-Repository Diff: Collision Checked Before Version Syntax
// ---------------------------------------------------------------------------

test("cross-repo diff checks patch collisions before version operands", async () => {
  const cli = await createRealCli();
  try {
    const repoA = path.join(cli.root, "repoA");
    const repoB = path.join(cli.root, "repoB");

    await cli.run(["init", "repoA"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], repoA);
    await cli.writeFile("repoA/f.txt", "content A\n");
    await cli.run(["commit", "first"], repoA);

    await cli.run(["init", "repoB"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], repoB);
    await cli.writeFile("repoB/f.txt", "content B\n");
    await cli.run(["commit", "first with different content"], repoB);

    // Both repos have (alice@example.com, 1) with colliding content.
    // Even if version operand is completely invalid, collision must be reported first!
    const fakeDiscovery: RepositoryDiscoveryPort = {
      findRepositoryRoot: async () => repoA,
    };
    const fakeSource: RepositorySourcePort = {
      load: async (_source, _cwd) => {
        const bytes = await cli.readFile("repoB/.snap/repository.json");
        const { decodeAndValidateRepositoryBytes } = await import("../src/application/repository/decode-repository.js");
        const validated = decodeAndValidateRepositoryBytes(new TextEncoder().encode(bytes));
        if (!validated.ok) return validated;
        return { ok: true, value: { repoRoot: repoB, repository: validated.value } };
      },
    };
    const fakeFs: FileSystemPort = {
      readFileIfExists: async (targetPath: string) => {
        try {
          const content = await cli.readFile(path.relative(cli.root, targetPath));
          return new TextEncoder().encode(content);
        } catch {
          return null;
        }
      },
      entryKind: async () => "file",
      pathExists: async () => true,
      isDirectory: async () => false,
      mkdirRecursive: async () => {},
      writeFile: async () => {},
      writeFileDurable: async () => {},
      renameFile: async () => {},
      removeFileIfExists: async () => {},
      listDirectory: async () => [],
    };

    const outcome = await diffAcrossRepositories(repoA, "invalid-syntax", "also-invalid", repoB, {
      fileSystem: fakeFs,
      repositoryDiscovery: fakeDiscovery,
      repositorySource: fakeSource,
    });

    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.error.category, "validation");
      assert.match(outcome.error.detail, /patch collision: alice@example\.com revision 1/);
    }
  } finally {
    await cli.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4. Load Local Operand Error Taxonomy Consistency
// ---------------------------------------------------------------------------

test("loadLocalOperand returns category 'io' for missing metadata, matching loadLocalRepository", async () => {
  const fakeFs: FileSystemPort = {
    readFileIfExists: async () => null,
    entryKind: async () => "missing",
    pathExists: async () => false,
    isDirectory: async () => false,
    mkdirRecursive: async () => {},
    writeFile: async () => {},
    writeFileDurable: async () => {},
    renameFile: async () => {},
    removeFileIfExists: async () => {},
    listDirectory: async () => [],
  };

  const outcome = await loadLocalOperand("/nonexistent", "operand", { fileSystem: fakeFs });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.error.category, "io");
    assert.match(outcome.error.detail, /repository metadata is missing/);
  }
});
