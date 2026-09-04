import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import type { FileSystemEntryKind, FileSystemPort } from "../src/ports/filesystem-port.js";

function fakeFileSystem(options: {
  directories?: readonly string[];
  files?: readonly string[];
  symlinks?: readonly string[];
}): FileSystemPort {
  const dirs = new Set(options.directories ?? []);
  const files = new Set(options.files ?? []);
  const symlinks = new Set(options.symlinks ?? []);
  return {
    entryKind: (candidate) => {
      let kind: FileSystemEntryKind = "missing";
      if (dirs.has(candidate)) {
        kind = "directory";
      } else if (files.has(candidate)) {
        kind = "file";
      } else if (symlinks.has(candidate)) {
        kind = "symlink";
      }
      return Promise.resolve(kind);
    },
    pathExists: (candidate) => Promise.resolve(dirs.has(candidate) || files.has(candidate)),
    isDirectory: (candidate) => Promise.resolve(dirs.has(candidate)),
    mkdirRecursive: () => Promise.reject(new Error("not used in this test")),
    writeFile: () => Promise.reject(new Error("not used in this test")),
    readFileIfExists: () => Promise.reject(new Error("not used in this test")),
    writeFileDurable: () => Promise.reject(new Error("not used in this test")),
    renameFile: () => Promise.reject(new Error("not used in this test")),
    removeFileIfExists: () => Promise.reject(new Error("not used in this test")),
    listDirectory: () => Promise.reject(new Error("not used in this test")),
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

test("finds .snap/repository.json when start directory has trailing slash or is unnormalized", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], files: [REPO_MANIFEST] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO + path.sep), REPO);
  assert.equal(await discovery.findRepositoryRoot(path.join(REPO, "child", "..")), REPO);
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

test("a symlink named repository.json inside .snap is not a valid repository", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO, SNAP_DIR], symlinks: [REPO_MANIFEST] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO), null);
});

test("a symlinked .snap directory is not a repository", async () => {
  const fileSystem = fakeFileSystem({ directories: [REPO], symlinks: [SNAP_DIR] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  assert.equal(await discovery.findRepositoryRoot(REPO), null);
});

test("rejects traversal through a symlinked existing path component", async () => {
  const linked = path.join(ROOT, "linked");
  const fileSystem = fakeFileSystem({ symlinks: [linked] });
  const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  await assert.rejects(
    discovery.findRepositoryRoot(path.join(linked, "child")),
    /repository discovery does not follow symbolic links/u,
  );
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
