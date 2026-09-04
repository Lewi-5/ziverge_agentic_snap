import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { runCli } from "../src/cli/dispatch.js";
import { SNAP_VERSION } from "../src/cli/version.js";
import type { CliPorts } from "../src/cli/types.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../src/ports/repository-discovery-port.js";

const GRAMMAR_ERROR_LINE = "snap: invalid command or arguments\n";

function throwingFileSystem(): FileSystemPort {
  const fail = (): never => {
    throw new Error("filesystem must not be touched");
  };
  return { pathExists: fail, isDirectory: fail, mkdirRecursive: fail, writeFile: fail };
}

function throwingDiscovery(): RepositoryDiscoveryPort {
  return {
    findRepositoryRoot: () => {
      throw new Error("discovery must not run");
    },
  };
}

const CWD = path.parse(process.cwd()).root;

test("--version succeeds without touching ports (no repository discovery)", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["--version"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.stdout, `snap ${SNAP_VERSION}\n`);
  assert.equal(outcome.stderr, "");
});

test("'--version' with extra arguments is a grammar error and touches no ports", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["--version", "extra"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("missing command", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: [], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("unknown command", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["frobnicate"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("'init a b' (extra operand) is a grammar error and mutates nothing", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["init", "a", "b"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("'init --unknown' (unknown option) is a grammar error and mutates nothing", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["init", "--unknown"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("init success through runCli", async () => {
  const writes = new Map<string, string>();
  const fileSystem: FileSystemPort = {
    pathExists: () => Promise.resolve(false),
    isDirectory: () => Promise.resolve(false),
    mkdirRecursive: () => Promise.resolve(),
    writeFile: (targetPath, contents) => {
      writes.set(targetPath, contents);
      return Promise.resolve();
    },
  };
  const repositoryDiscovery: RepositoryDiscoveryPort = { findRepositoryRoot: () => Promise.resolve(null) };
  const outcome = await runCli({ argv: ["init", "repo"], cwd: CWD, ports: { fileSystem, repositoryDiscovery } });

  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.stdout, "()\n");
  assert.equal(outcome.stderr, "");
  assert.equal(writes.size, 1);
});

test("init failure (already exists) through runCli", async () => {
  const target = path.join(CWD, "repo");
  const fileSystem = throwingFileSystem();
  const repositoryDiscovery: RepositoryDiscoveryPort = { findRepositoryRoot: () => Promise.resolve(target) };
  const outcome = await runCli({ argv: ["init", "repo"], cwd: CWD, ports: { fileSystem, repositoryDiscovery } });

  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, "snap: repository already exists\n");
});

test("an unexpected throw from a handler maps to exit 2", async () => {
  const ports: CliPorts = { fileSystem: throwingFileSystem(), repositoryDiscovery: throwingDiscovery() };
  const outcome = await runCli({ argv: ["init"], cwd: CWD, ports });
  assert.equal(outcome.exitCode, 2);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, "snap: discovery must not run\n");
});
