import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRealCli } from "./support/real-cli.js";
import { runCli } from "../src/cli/dispatch.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import { createNodeHttpServerAdapter } from "../src/adapters/node-http-server-adapter.js";
import { renderCommandResult } from "../src/cli/render.js";
import { renderCommandResultTerminal } from "../src/cli/render-terminal.js";
import { EMPTY_VERSION } from "../src/domain/version/types.js";
import type { CliPorts } from "../src/cli/types.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { SignalPort } from "../src/ports/signal-port.js";

/**
 * Work Package 2 ("Full command/failure matrix") from
 * snap/module_plans/module9REMAINING.md. This file is a CONSOLIDATION pass,
 * not a rewrite: `cli-grammar-matrix.test.ts` already covers accepted
 * grammar forms for every command, and each command's own test file
 * (commit-command.test.ts, status-command.test.ts, log-command.test.ts,
 * diff-command.test.ts, module6.test.ts, cli-config.test.ts,
 * config-process.test.ts, serve-command.test.ts) already covers its own
 * success/error paths in isolation. Every section below says explicitly,
 * per command, whether it is new coverage or a citation of existing
 * coverage — nothing here duplicates an existing assertion just to have it
 * "in one place".
 */

/** A directory at least two levels below a repository root. */
function nestedCwd(repoRoot: string): string {
  return path.join(repoRoot, "a", "b", "c");
}

async function mkNested(repoRoot: string): Promise<string> {
  const dir = nestedCwd(repoRoot);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// 1. Representative success: exact documented stdout shape (SPEC §7).
// ---------------------------------------------------------------------------
//
// Already covered elsewhere with the exact byte-for-byte assertion, so not
// duplicated here:
//   - status: test/status-command.test.ts ("version ()\n" / dirty rows)
//   - log: test/log-command.test.ts (reverse order, escape golden)
//   - commit: test/commit-command.test.ts ("(alice@example.com->1)\n")
//   - diff: test/diff-command.test.ts (scenario 05/06 goldens)
//   - revert: test/module6.test.ts ("(alice@example.com->3)\n")
//   - merge: test/module6.test.ts ("(alice@example.com->2,bob@example.com->1)\n")
//   - config: test/cli-config.test.ts + config-process.test.ts (silent, see §6 below)
//   - --version: test/cli-dispatch.test.ts (`snap ${SNAP_VERSION}\n`, no ports touched)
//
// Genuinely missing: `init`'s exact stdout through the real CLI (existing
// coverage only checks exitCode, or exercises `initRepository` directly
// without the dispatch/render layer), and `--serve`'s exact stdout through
// the CLI dispatch layer (existing coverage in serve-command.test.ts calls
// the `serve()` application function directly, bypassing runCli's
// presentation/output-flush wiring entirely).

test("1. init: real CLI prints the exact documented '()' on success (SPEC §7.1)", async () => {
  const cli = await createRealCli();
  try {
    const outcome = await cli.run(["init", "repo"]);
    assert.deepEqual(outcome, { exitCode: 0, stdout: "()\n", stderr: "" });
  } finally {
    await cli.cleanup();
  }
});

test("1. --serve: real CLI dispatch prints the exact documented startup URL and flushes it before shutdown (SPEC §7.9)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-cli-"));
  try {
    const repoDir = path.join(root, "repo");
    await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, ".snap", "repository.json"),
      '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n',
      "utf8",
    );

    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({});
    const workingTree = createNodeWorkingTreeAdapter(fileSystem);
    const httpServer = createNodeHttpServerAdapter();

    let listener: (() => void) | undefined;
    const signal: SignalPort = {
      onSignal(_signals, cb) {
        listener = cb;
        return () => {
          listener = undefined;
        };
      },
    };

    const ports: CliPorts = { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal };
    const outcomePromise = runCli({ argv: ["--serve", "0"], cwd: repoDir, ports });

    // Give the server a tick to bind, then trigger the fake shutdown signal
    // ourselves (not a real OS SIGTERM) so the command resolves without
    // depending on the Windows SIGTERM delivery limitation documented in
    // module9REMAINING.md.
    await new Promise((resolve) => setTimeout(resolve, 50));
    listener?.();

    const outcome = await outcomePromise;
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /^http:\/\/127\.0\.0\.1:\d+\/repository\.json\n$/);
    assert.equal(outcome.stderr, "");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Repository discovery from a nested directory (2+ levels below root).
// ---------------------------------------------------------------------------
//
// This is the actual gap module9REMAINING.md calls out: repository
// discovery from a nested cwd is unit-tested directly against the discovery
// adapter (node-repository-discovery-adapter.test.ts, "discovers a
// repository from a nested cwd"), but no existing test drives every
// repo-resolving CLI command from a nested cwd end-to-end. Every
// repo-resolving command routes through the same
// `loadLocalRepository`/`findRepositoryRoot` call, so this is real
// end-to-end confirmation, not incidental duplication.

test("2. status/log/diff resolve the repository from a nested working directory", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repoRoot = path.join(cli.root, "repo");
    const nested = await mkNested(repoRoot);

    const status = await cli.run(["status"], nested);
    assert.deepEqual(status, { exitCode: 0, stdout: "version ()\n", stderr: "" });

    const log = await cli.run(["log"], nested);
    assert.deepEqual(log, { exitCode: 0, stdout: "", stderr: "" });

    const diff = await cli.run(["diff"], nested);
    assert.deepEqual(diff, { exitCode: 0, stdout: "", stderr: "" });
  } finally {
    await cli.cleanup();
  }
});

test("2. config (local) resolves and writes to the discovered repository root from a nested working directory", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repoRoot = path.join(cli.root, "repo");
    const nested = await mkNested(repoRoot);

    const outcome = await cli.run(["config", "contributor.id", "nested@example.com"], nested);
    assert.deepEqual(outcome, { exitCode: 0, stdout: "", stderr: "" });

    const written = await fs.readFile(path.join(repoRoot, ".snap", "config.json"), "utf8");
    assert.equal(written, '{\n  "contributor": {\n    "id": "nested@example.com"\n  }\n}\n');
  } finally {
    await cli.cleanup();
  }
});

test("2. commit and revert resolve the repository from a nested working directory", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repoRoot = path.join(cli.root, "repo");
    await cli.run(["config", "contributor.id", "alice@example.com"], repoRoot);
    const nested = await mkNested(repoRoot);

    await cli.writeFile("repo/a/b/c/note.txt", "hello\n");
    const committed = await cli.run(["commit", "from nested cwd"], nested);
    assert.deepEqual(committed, { exitCode: 0, stdout: "(alice@example.com->1)\n", stderr: "" });

    const reverted = await cli.run(["revert", "()"], nested);
    assert.equal(reverted.exitCode, 0);
    assert.equal(reverted.stdout, "(alice@example.com->2)\n");
  } finally {
    await cli.cleanup();
  }
});

test("2. merge resolves the local repository from a nested working directory", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");
    await cli.run(["init", "left"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], left);
    await cli.writeFile("left/a.txt", "a\n");
    await cli.run(["commit", "a"], left);

    await cli.run(["init", "right"]);
    await cli.run(["config", "contributor.id", "bob@example.com"], right);
    await cli.writeFile("right/b.txt", "b\n");
    await cli.run(["commit", "b"], right);

    const nestedLeft = await mkNested(left);
    const merged = await cli.run(["merge", right], nestedLeft);
    assert.equal(merged.exitCode, 0);
    assert.equal(merged.stdout, "(alice@example.com->1,bob@example.com->1)\n");
  } finally {
    await cli.cleanup();
  }
});

test("2. init detects it is nested inside an existing repository from 2+ levels down", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repoRoot = path.join(cli.root, "repo");
    const nested = await mkNested(repoRoot);

    // Default target "." from a nested cwd: init must discover the ancestor
    // repository and refuse, per SPEC §7.1 ("initializing a target inside an
    // existing repository is an error"), not silently create a second
    // .snap inside the nested directory.
    const outcome = await cli.run(["init"], nested);
    assert.deepEqual(outcome, {
      exitCode: 1,
      stdout: "",
      stderr: "snap: cannot initialize inside repository\n",
    });
    await assert.rejects(fs.access(path.join(nested, ".snap")));
  } finally {
    await cli.cleanup();
  }
});

test("2. --serve resolves the repository from a nested working directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-nested-"));
  try {
    const repoDir = path.join(root, "repo");
    const nested = path.join(repoDir, "a", "b", "c");
    await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(
      path.join(repoDir, ".snap", "repository.json"),
      '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n',
      "utf8",
    );

    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({});
    const workingTree = createNodeWorkingTreeAdapter(fileSystem);
    const httpServer = createNodeHttpServerAdapter();
    let listener: (() => void) | undefined;
    const signal: SignalPort = {
      onSignal(_signals, cb) {
        listener = cb;
        return () => {
          listener = undefined;
        };
      },
    };

    const ports: CliPorts = { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal };
    const outcomePromise = runCli({ argv: ["--serve", "0"], cwd: nested, ports });
    await new Promise((resolve) => setTimeout(resolve, 50));
    listener?.();

    const outcome = await outcomePromise;
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /^http:\/\/127\.0\.0\.1:\d+\/repository\.json\n$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Expected error channel: exit 1, empty stdout, exactly one
//    "snap: <detail>\n" stderr line.
// ---------------------------------------------------------------------------
//
// Per-command domain errors (invalid message, invalid version, dirty tree,
// unknown version, dot collision, ...) are already exhaustively covered in
// each command's own test file — not repeated here. What is missing is the
// single most representative domain error ("not a Snap repository") applied
// uniformly to every command that resolves one; only `status`
// (status-command.test.ts) and local `config` (cli-config.test.ts) already
// have this exact check.

test("3. log/diff/commit/revert/merge/--serve fail with the exact 'not a Snap repository' line outside any repository", async () => {
  const cli = await createRealCli();
  try {
    const outsideAnyRepo = cli.root;

    const cases: { readonly args: readonly string[] }[] = [
      { args: ["log"] },
      { args: ["diff"] },
      { args: ["commit", "message"] },
      { args: ["revert", "()"] },
      { args: ["merge", "some-other-repo"] },
    ];
    for (const { args } of cases) {
      const outcome = await cli.run(args, outsideAnyRepo);
      assert.deepEqual(
        outcome,
        { exitCode: 1, stdout: "", stderr: "snap: not a Snap repository\n" },
        `expected 'not a Snap repository' for ${JSON.stringify(args)}`,
      );
    }
  } finally {
    await cli.cleanup();
  }
});

test("3. --serve fails with the exact 'not a Snap repository' line outside any repository, without binding a socket", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-norepo-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({});
    const workingTree = createNodeWorkingTreeAdapter(fileSystem);
    let listenCalls = 0;
    const httpServer = {
      listen: (options: Parameters<ReturnType<typeof createNodeHttpServerAdapter>["listen"]>[0]) => {
        listenCalls += 1;
        return createNodeHttpServerAdapter().listen(options);
      },
    };
    const signal: SignalPort = { onSignal: () => () => undefined };

    const ports: CliPorts = { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal };
    const outcome = await runCli({ argv: ["--serve", "0"], cwd: root, ports });
    assert.deepEqual(outcome, { exitCode: 1, stdout: "", stderr: "snap: not a Snap repository\n" });
    assert.equal(listenCalls, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Injected unexpected failure maps to exit 2.
// ---------------------------------------------------------------------------
//
// cli-dispatch.test.ts already covers this exact pattern for `init` ("an
// unexpected throw from a handler maps to exit 2"). This spot-checks it for
// `status`, a command that goes through the real Node filesystem/discovery
// adapters (unlike cli-dispatch.test.ts's fully-stubbed ports), by wrapping
// one real port method to throw a non-domain error.

test("4. an unexpected throw from a real port during 'status' maps to exit 2 with the raw message", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-unexpected-"));
  try {
    const repoDir = path.join(root, "repo");
    await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, ".snap", "repository.json"),
      '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n',
      "utf8",
    );

    const realFileSystem = createNodeFileSystemAdapter();
    const wrappedFileSystem: FileSystemPort = {
      ...realFileSystem,
      readFileIfExists: (targetPath) => {
        if (targetPath.endsWith("repository.json")) {
          throw new Error("injected unexpected failure: disk gremlin");
        }
        return realFileSystem.readFileIfExists(targetPath);
      },
    };
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(realFileSystem);
    const environment = createNodeEnvironmentAdapter({});
    const workingTree = createNodeWorkingTreeAdapter(realFileSystem);

    const ports: CliPorts = { fileSystem: wrappedFileSystem, repositoryDiscovery, environment, workingTree };
    const outcome = await runCli({ argv: ["status"], cwd: repoDir, ports });
    assert.deepEqual(outcome, {
      exitCode: 2,
      stdout: "",
      stderr: "snap: injected unexpected failure: disk gremlin\n",
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Read-only commands never mutate: status/log/diff leave repository.json
//    and the working tree byte-identical, including on error paths.
// ---------------------------------------------------------------------------

test("5. status/log/diff never mutate repository.json or the working tree, including on their error paths", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repoRoot = path.join(cli.root, "repo");
    await cli.run(["config", "contributor.id", "alice@example.com"], repoRoot);
    await cli.writeFile("repo/a.txt", "a\n");
    await cli.run(["commit", "first"], repoRoot);
    await cli.writeFile("repo/a.txt", "a2\n");
    await cli.writeFile("repo/new.txt", "new\n");

    const manifestPath = path.join(repoRoot, ".snap", "repository.json");
    const before = await fs.readFile(manifestPath, "utf8");
    const workingBefore = await fs.readFile(path.join(repoRoot, "a.txt"), "utf8");

    // Success paths.
    assert.equal((await cli.run(["status"], repoRoot)).exitCode, 0);
    assert.equal((await cli.run(["log"], repoRoot)).exitCode, 0);
    assert.equal((await cli.run(["diff"], repoRoot)).exitCode, 0);
    assert.equal((await cli.run(["diff", "()", "(alice@example.com->1)"], repoRoot)).exitCode, 0);

    // Error paths: unknown version for diff.
    assert.equal((await cli.run(["diff", "(nobody@x->1)", "()"], repoRoot)).exitCode, 1);
    // Grammar errors for status/log.
    assert.equal((await cli.run(["status", "extra"], repoRoot)).exitCode, 1);
    assert.equal((await cli.run(["log", "extra"], repoRoot)).exitCode, 1);

    const after = await fs.readFile(manifestPath, "utf8");
    const workingAfter = await fs.readFile(path.join(repoRoot, "a.txt"), "utf8");
    assert.equal(after, before);
    assert.equal(workingAfter, workingBefore);
    assert.equal(await fs.readFile(path.join(repoRoot, "new.txt"), "utf8"), "new\n");
  } finally {
    await cli.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 6. `config` stays silent on success, both local and --global.
// ---------------------------------------------------------------------------
//
// Already fully covered: cli-config.test.ts ("real filesystem: local write
// ..." / "real filesystem: global write ...", both assert stdout === "")
// and config-process.test.ts (both process-level tests assert
// `{ exitCode: 0, stdout: "", stderr: "" }` through the actual executable
// entry point). Nothing genuinely missing here; intentionally not
// duplicated.

// ---------------------------------------------------------------------------
// 7. Identity requirements (SPEC §8): --version and config --global need no
//    repository; merge needs no contributor identity; only commit/revert
//    resolve and require one.
// ---------------------------------------------------------------------------

test("7. --version needs no repository (already proven via fully-throwing ports in cli-dispatch.test.ts; direct real-CLI confirmation here)", async () => {
  const cli = await createRealCli();
  try {
    // cli.root itself is not a Snap repository.
    const outcome = await cli.run(["--version"]);
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /^snap \d+\.\d+\.\d+\n$/);
  } finally {
    await cli.cleanup();
  }
});

test("7. config --global needs no repository, even with none configured anywhere", async () => {
  const cli = await createRealCli();
  try {
    const outcome = await cli.run(["config", "--global", "contributor.id", "alice@example.com"]);
    assert.deepEqual(outcome, { exitCode: 0, stdout: "", stderr: "" });
  } finally {
    await cli.cleanup();
  }
});

test("7. merge succeeds with no contributor.id configured locally or globally, unlike commit/revert", async () => {
  const cli = await createRealCli();
  try {
    const left = path.join(cli.root, "left");
    const right = path.join(cli.root, "right");

    // Seed histories using a temporary contributor id, then strip all
    // identity configuration before exercising each command, so the
    // assertions below reflect "no identity is configured anywhere" rather
    // than merely "the merge command doesn't read identity."
    await cli.run(["init", "left"]);
    await cli.run(["config", "contributor.id", "alice@example.com"], left);
    await cli.writeFile("left/a.txt", "a\n");
    await cli.run(["commit", "a"], left);

    await cli.run(["init", "right"]);
    await cli.run(["config", "contributor.id", "bob@example.com"], right);
    await cli.writeFile("right/b.txt", "b\n");
    await cli.run(["commit", "b"], right);

    // Remove left's local identity; HOME (cli.home) has no global config
    // either, so no contributor.id is resolvable from "left" at all.
    await cli.removeFile("left/.snap/config.json");

    const NO_IDENTITY_ERROR = "snap: contributor.id is required; configure it locally or globally\n";

    // commit and revert require identity and fail with the exact message.
    await cli.writeFile("left/c.txt", "c\n");
    const commitOutcome = await cli.run(["commit", "needs identity"], left);
    assert.deepEqual(commitOutcome, { exitCode: 1, stdout: "", stderr: NO_IDENTITY_ERROR });
    await cli.removeFile("left/c.txt");

    const revertOutcome = await cli.run(["revert", "()"], left);
    assert.deepEqual(revertOutcome, { exitCode: 1, stdout: "", stderr: NO_IDENTITY_ERROR });

    // merge requires no identity and succeeds despite none being configured.
    const mergeOutcome = await cli.run(["merge", right], left);
    assert.equal(mergeOutcome.exitCode, 0);
    assert.equal(mergeOutcome.stdout, "(alice@example.com->1,bob@example.com->1)\n");
    assert.equal(mergeOutcome.stderr, "");
  } finally {
    await cli.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 8. SNAP_COLOR/NO_COLOR precedence is re-checked per invocation, not cached.
// ---------------------------------------------------------------------------
//
// presentation-selection.test.ts already covers this exhaustively at the
// `resolvePresentation` selection-function level. This proves it holds
// through the real CLI end-to-end: the same repository state, presented
// through two consecutive `status` invocations of the same runCli-backed
// process state with different SNAP_COLOR values, produces two independently
// correct presentations (not a value cached from the first call).

test("8. SNAP_COLOR is re-resolved on every invocation, not cached across consecutive real-CLI commands", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-color-precedence-"));
  try {
    const repoDir = path.join(root, "repo");
    await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, ".snap", "repository.json"),
      '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n',
      "utf8",
    );

    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const workingTree = createNodeWorkingTreeAdapter(fileSystem);

    const expectedPlain = renderCommandResult({ kind: "status", version: EMPTY_VERSION, rows: [] });
    const expectedTerminal = renderCommandResultTerminal({ kind: "status", version: EMPTY_VERSION, rows: [] });
    // Sanity: these two expected renderings must actually differ, or this
    // test would pass vacuously.
    assert.notEqual(expectedPlain, expectedTerminal);

    // SNAP_COLOR=always forces terminal mode regardless of TTY state, and
    // SNAP_COLOR=never forces plain mode regardless of TTY state (SPEC
    // §7.11), so this doesn't need a TerminalPort at all to be deterministic.
    const alwaysPorts: CliPorts = {
      fileSystem,
      repositoryDiscovery,
      workingTree,
      environment: createNodeEnvironmentAdapter({ SNAP_COLOR: "always" }),
    };
    const neverPorts: CliPorts = {
      fileSystem,
      repositoryDiscovery,
      workingTree,
      environment: createNodeEnvironmentAdapter({ SNAP_COLOR: "never" }),
    };

    const first = await runCli({ argv: ["status"], cwd: repoDir, ports: alwaysPorts });
    assert.equal(first.exitCode, 0);
    assert.equal(first.stdout, expectedTerminal);

    // Same repository state, same process, a fresh runCli call immediately
    // after with the opposite SNAP_COLOR value: must not reuse the first
    // call's resolved presentation.
    const second = await runCli({ argv: ["status"], cwd: repoDir, ports: neverPorts });
    assert.equal(second.exitCode, 0);
    assert.equal(second.stdout, expectedPlain);

    // And back again, to rule out any lingering state from the second call.
    const third = await runCli({ argv: ["status"], cwd: repoDir, ports: alwaysPorts });
    assert.equal(third.exitCode, 0);
    assert.equal(third.stdout, expectedTerminal);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
