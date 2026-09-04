import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "../src/cli/dispatch.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import type { CliPorts } from "../src/cli/types.js";
import type { EnvironmentPort } from "../src/ports/environment-port.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../src/ports/repository-discovery-port.js";

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
    environment: { getEnv: fail },
  };
}

test("grammar: missing arguments is a grammar error and touches no ports", async () => {
  const outcome = await runCli({ argv: ["config"], cwd: CWD, ports: throwingPorts() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("grammar: '--global contributor.id' missing the value is a grammar error", async () => {
  const outcome = await runCli({
    argv: ["config", "--global", "contributor.id"],
    cwd: CWD,
    ports: throwingPorts(),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("grammar: a misplaced --global after the value is a grammar error", async () => {
  const outcome = await runCli({
    argv: ["config", "contributor.id", "a@x", "--global"],
    cwd: CWD,
    ports: throwingPorts(),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("grammar: a duplicate --global flag is a grammar error", async () => {
  const outcome = await runCli({
    argv: ["config", "--global", "--global", "contributor.id", "a@x"],
    cwd: CWD,
    ports: throwingPorts(),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("grammar: an unknown configuration key is a grammar error", async () => {
  const outcome = await runCli({ argv: ["config", "other.key", "val"], cwd: CWD, ports: throwingPorts() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stderr, GRAMMAR_ERROR_LINE);
});

test("grammar: an invalid contributor id reaches setConfig and fails with the exact diagnostic", async () => {
  const fileSystem: FileSystemPort = {
    entryKind: () => Promise.resolve("missing"),
    pathExists: () => Promise.resolve(false),
    isDirectory: () => Promise.resolve(false),
    mkdirRecursive: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    readFileIfExists: () => Promise.resolve(null),
    writeFileDurable: () => Promise.resolve(),
    renameFile: () => Promise.resolve(),
    removeFileIfExists: () => Promise.resolve(),
    listDirectory: () => Promise.resolve([]),
  };
  const repositoryDiscovery: RepositoryDiscoveryPort = { findRepositoryRoot: () => Promise.resolve(null) };
  const environment: EnvironmentPort = { getEnv: () => undefined };
  const outcome = await runCli({
    argv: ["config", "contributor.id", "bad-id"],
    cwd: CWD,
    ports: { fileSystem, repositoryDiscovery, environment },
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, "snap: invalid contributor id: bad-id\n");
});

test("real filesystem: local write through the same Node adapters main.ts uses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-config-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({});

    const repoRoot = path.join(root, "repo");
    await fs.mkdir(path.join(repoRoot, ".snap"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, ".snap", "repository.json"), "{}", "utf8");

    const outcome = await runCli({
      argv: ["config", "contributor.id", "alice@example.com"],
      cwd: repoRoot,
      ports: { fileSystem, repositoryDiscovery, environment },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "");

    const written = await fs.readFile(path.join(repoRoot, ".snap", "config.json"), "utf8");
    assert.equal(written, '{\n  "contributor": {\n    "id": "alice@example.com"\n  }\n}\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: global write requires no repository and needs HOME", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-config-global-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const home = path.join(root, "home");
    await fs.mkdir(home, { recursive: true });
    const environment = createNodeEnvironmentAdapter({ HOME: home });

    const outcome = await runCli({
      argv: ["config", "--global", "contributor.id", "alice@example.com"],
      cwd: root,
      ports: { fileSystem, repositoryDiscovery, environment },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "");

    const written = await fs.readFile(path.join(home, ".snapconfig.json"), "utf8");
    assert.equal(written, '{\n  "contributor": {\n    "id": "alice@example.com"\n  }\n}\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: local write outside any repository fails with 'not a Snap repository'", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-config-norepo-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({});

    const outcome = await runCli({
      argv: ["config", "contributor.id", "alice@example.com"],
      cwd: root,
      ports: { fileSystem, repositoryDiscovery, environment },
    });
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, "snap: not a Snap repository\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
