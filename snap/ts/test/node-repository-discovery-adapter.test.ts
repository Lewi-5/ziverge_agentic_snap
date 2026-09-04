import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";

function fakeFileSystem(options: { directories?: readonly string[]; files?: readonly string[] }): FileSystemPort {
  const dirs = new Set(options.directories ?? []);
  const files = new Set(options.files ?? []);
  return {
    pathExists: (candidate) => Promise.resolve(dirs.has(candidate) || files.has(candidate)),
    isDirectory: (candidate) => Promise.resolve(dirs.has(candidate)),
    mkdirRecursive: () => Promise.reject(new Error("not used in this test")),
    writeFile: () => Promise.reject(new Error("not used in this test")),
  };
}

const ROOT = path.parse(process.cwd()).root;
const REPO = path.join(ROOT, "repo");
const SNAP_DIR = path.join(REPO, ".snap");
const REPO_MANIFEST = path.join(SNAP_DIR, "repository.json");

test("finds .snap/repository.json exactly at the start directory", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], files: [REPO_MANIFEST] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO), REPO);
});

test("finds .snap/repository.json at an ancestor directory", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], files: [REPO_MANIFEST] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const nested = path.join(REPO, "child", "grandchild");
  assert.equal(await discovery.findRepositoryRoot(nested), REPO);
});

test("a bare .snap directory without repository.json is not a repository", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], files: [] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO), null);
});

test("a directory named repository.json inside .snap is not a valid repository", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR, REPO_MANIFEST], files: [] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO), null);
});

test("a missing target directory still discovers a repository at its nearest existing ancestor", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], files: [REPO_MANIFEST] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const missingNestedTarget = path.join(REPO, "new", "child");
  assert.equal(await discovery.findRepositoryRoot(missingNestedTarget), REPO);
});

test("returns null when no ancestor has .snap/repository.json", async () => {
  const fileSystem = fakeFileSystem({});
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(path.join(ROOT, "a", "b", "c")), null);
});

test("stops at the filesystem root without an infinite loop", async () => {
  const fileSystem = fakeFileSystem({});
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(ROOT), null);
});

test("real filesystem: discovers a repository from a nested cwd, not from a sibling tree", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-discovery-"));
  try {
    const repoRoot = path.join(root, "repo");
    const nested = path.join(repoRoot, "src", "deep");
    const sibling = path.join(root, "sibling", "deep");
    await fs.mkdir(path.join(repoRoot, ".snap"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, ".snap", "repository.json"), "{}", "utf8");
    await fs.mkdir(nested, { recursive: true });
    await fs.mkdir(sibling, { recursive: true });

    const fileSystem = createNodeFileSystemAdapter();
    const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);

    assert.equal(await discovery.findRepositoryRoot(nested), repoRoot);
    assert.equal(await discovery.findRepositoryRoot(sibling), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
