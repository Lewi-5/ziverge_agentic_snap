import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { setConfig } from "../src/application/config/set-config.js";
import type { EnvironmentPort } from "../src/ports/environment-port.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../src/ports/repository-discovery-port.js";

const CWD = path.parse(process.cwd()).root;

function recordingFileSystem(): FileSystemPort & { readonly writes: Map<string, string> } {
  const writes = new Map<string, string>();
  return {
    writes,
    entryKind: () => Promise.resolve("missing"),
    pathExists: () => Promise.resolve(false),
    isDirectory: () => Promise.resolve(false),
    mkdirRecursive: () => Promise.resolve(),
    writeFile: (targetPath, contents) => {
      writes.set(targetPath, contents);
      return Promise.resolve();
    },
    readFileIfExists: () => Promise.resolve(null),
  };
}

function discoveryReturning(root: string | null): RepositoryDiscoveryPort {
  return { findRepositoryRoot: () => Promise.resolve(root) };
}

function environmentWith(home: string | undefined): EnvironmentPort {
  return { getEnv: (name) => (name === "HOME" ? home : undefined) };
}

test("local write: valid id and repository present writes .snap/config.json with 2-space indent and LF", async () => {
  const fileSystem = recordingFileSystem();
  const repoRoot = path.join(CWD, "repo");
  const result = await setConfig(
    { cwd: CWD, global: false, contributorId: "alice@example.com" },
    { fileSystem, repositoryDiscovery: discoveryReturning(repoRoot), environment: environmentWith(undefined) },
  );
  assert.equal(result.ok, true);
  const written = fileSystem.writes.get(path.join(repoRoot, ".snap", "config.json"));
  assert.equal(written, '{\n  "contributor": {\n    "id": "alice@example.com"\n  }\n}\n');
});

test("local write overwrites existing content without reading or parsing it first", async () => {
  const fileSystem = recordingFileSystem();
  const repoRoot = path.join(CWD, "repo");
  let readCalls = 0;
  const readTrackingFileSystem: FileSystemPort = {
    ...fileSystem,
    readFileIfExists: () => {
      readCalls += 1;
      return Promise.resolve(null);
    },
  };
  const result = await setConfig(
    { cwd: CWD, global: false, contributorId: "alice@example.com" },
    {
      fileSystem: readTrackingFileSystem,
      repositoryDiscovery: discoveryReturning(repoRoot),
      environment: environmentWith(undefined),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(readCalls, 0);
});

test("local write outside a repository fails and makes zero write calls", async () => {
  const fileSystem = recordingFileSystem();
  const result = await setConfig(
    { cwd: CWD, global: false, contributorId: "alice@example.com" },
    { fileSystem, repositoryDiscovery: discoveryReturning(null), environment: environmentWith(undefined) },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "not a Snap repository");
  }
  assert.equal(fileSystem.writes.size, 0);
});

test("global write: valid id and HOME set writes $HOME/.snapconfig.json without repository discovery", async () => {
  const fileSystem = recordingFileSystem();
  const home = path.join(CWD, "home");
  let discoveryCalls = 0;
  const trackingDiscovery: RepositoryDiscoveryPort = {
    findRepositoryRoot: () => {
      discoveryCalls += 1;
      return Promise.resolve(null);
    },
  };
  const result = await setConfig(
    { cwd: CWD, global: true, contributorId: "alice@example.com" },
    { fileSystem, repositoryDiscovery: trackingDiscovery, environment: environmentWith(home) },
  );
  assert.equal(result.ok, true);
  assert.equal(discoveryCalls, 0);
  const written = fileSystem.writes.get(path.join(home, ".snapconfig.json"));
  assert.equal(written, '{\n  "contributor": {\n    "id": "alice@example.com"\n  }\n}\n');
});

test("global write with HOME unset fails with 'global configuration is unavailable' and writes nothing", async () => {
  const fileSystem = recordingFileSystem();
  const result = await setConfig(
    { cwd: CWD, global: true, contributorId: "alice@example.com" },
    { fileSystem, repositoryDiscovery: discoveryReturning(null), environment: environmentWith(undefined) },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "global configuration is unavailable");
  }
  assert.equal(fileSystem.writes.size, 0);
});

test("global write with HOME empty fails with 'global configuration is unavailable'", async () => {
  const fileSystem = recordingFileSystem();
  const result = await setConfig(
    { cwd: CWD, global: true, contributorId: "alice@example.com" },
    { fileSystem, repositoryDiscovery: discoveryReturning(null), environment: environmentWith("") },
  );
  assert.equal(result.ok, false);
  assert.equal(fileSystem.writes.size, 0);
});

test("invalid contributor id fails before environment lookup or repository discovery, writing nothing", async () => {
  const fileSystem = recordingFileSystem();
  let discoveryCalls = 0;
  let envCalls = 0;
  const trackingDiscovery: RepositoryDiscoveryPort = {
    findRepositoryRoot: () => {
      discoveryCalls += 1;
      return Promise.resolve(null);
    },
  };
  const trackingEnvironment: EnvironmentPort = {
    getEnv: () => {
      envCalls += 1;
      return undefined;
    },
  };
  const result = await setConfig(
    { cwd: CWD, global: true, contributorId: "two@@x" },
    { fileSystem, repositoryDiscovery: trackingDiscovery, environment: trackingEnvironment },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "invalid contributor id: two@@x");
  }
  assert.equal(discoveryCalls, 0);
  assert.equal(envCalls, 0);
  assert.equal(fileSystem.writes.size, 0);
});
