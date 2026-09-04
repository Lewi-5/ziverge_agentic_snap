import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { resolveContributorId } from "../src/application/config/resolve-contributor-id.js";
import type { EnvironmentPort } from "../src/ports/environment-port.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";

const REPO_ROOT = path.join(path.parse(process.cwd()).root, "repo");
const LOCAL_PATH = path.join(REPO_ROOT, ".snap", "config.json");

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fileSystemWith(files: Readonly<Record<string, string>>): FileSystemPort {
  const fail = (): never => {
    throw new Error("not used in this test");
  };
  return {
    pathExists: fail,
    isDirectory: fail,
    mkdirRecursive: fail,
    writeFile: fail,
    readFileIfExists: (candidate) => {
      const contents = files[candidate];
      return Promise.resolve(contents === undefined ? null : bytesOf(contents));
    },
  };
}

function environmentWith(home: string | undefined): EnvironmentPort {
  return { getEnv: (name) => (name === "HOME" ? home : undefined) };
}

function globalPath(home: string): string {
  return path.join(home, ".snapconfig.json");
}

test("local config present and valid: returns local id without reading global", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fileSystem = fileSystemWith({
    [LOCAL_PATH]: '{"contributor":{"id":"local@example.com"}}',
    [globalPath(home)]: "this must never be read",
  });
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "local@example.com");
  }
});

test("invalid local config blocks global fallback even when global is valid", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fileSystem = fileSystemWith({
    [LOCAL_PATH]: "not json",
    [globalPath(home)]: '{"contributor":{"id":"global@example.com"}}',
  });
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.detail, /invalid JSON/);
  }
});

test("local absent, global present and valid: returns global id", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fileSystem = fileSystemWith({ [globalPath(home)]: '{"contributor":{"id":"global@example.com"}}' });
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "global@example.com");
  }
});

test("local absent, global malformed: fails with the global validation error", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fileSystem = fileSystemWith({ [globalPath(home)]: "not json" });
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.detail, /invalid JSON/);
  }
});

test("neither local nor global config exists: fails with the missing-identity message", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fileSystem = fileSystemWith({});
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "contributor.id is required; configure it locally or globally");
  }
});

test("local absent, HOME unset: fails with the missing-identity message", async () => {
  const fileSystem = fileSystemWith({});
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(undefined) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "contributor.id is required; configure it locally or globally");
  }
});

test("local absent, HOME empty: global configuration is unavailable, treated as missing identity", async () => {
  const fileSystem = fileSystemWith({});
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith("") });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "contributor.id is required; configure it locally or globally");
  }
});

test("invalid UTF-8 bytes in local config fail without reading global", async () => {
  const home = path.join(REPO_ROOT, "..", "home");
  const fail = (): never => {
    throw new Error("not used in this test");
  };
  const fileSystem: FileSystemPort = {
    pathExists: fail,
    isDirectory: fail,
    mkdirRecursive: fail,
    writeFile: fail,
    readFileIfExists: (candidate) => Promise.resolve(candidate === LOCAL_PATH ? new Uint8Array([0xff]) : fail()),
  };
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(home) });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "invalid UTF-8");
  }
});

test("a permission-style read failure propagates as an unexpected error, not a fallback", async () => {
  const fail = (): never => {
    throw new Error("permission denied");
  };
  const fileSystem: FileSystemPort = {
    pathExists: fail,
    isDirectory: fail,
    mkdirRecursive: fail,
    writeFile: fail,
    readFileIfExists: fail,
  };
  await assert.rejects(
    resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(undefined) }),
    /permission denied/,
  );
});

test("does not invoke repository discovery: it only touches the supplied repository root", async () => {
  const fileSystem = fileSystemWith({ [LOCAL_PATH]: '{"contributor":{"id":"local@example.com"}}' });
  const result = await resolveContributorId(REPO_ROOT, { fileSystem, environment: environmentWith(undefined) });
  assert.equal(result.ok, true);
});
