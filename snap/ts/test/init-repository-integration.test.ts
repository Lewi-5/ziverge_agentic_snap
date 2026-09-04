import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { initRepository } from "../src/application/init-repository.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";

test("real filesystem: init preserves existing working files and rejects reinitialization/nesting through the same Node adapters main.ts uses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-init-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const ports = { fileSystem, repositoryDiscovery };

    const repoDir = path.join(root, "repo");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.writeFile(path.join(repoDir, "existing.txt"), "keep me\n", "utf8");

    const first = await initRepository({ cwd: root, targetPath: "repo" }, ports);
    assert.equal(first.ok, true);

    const existingContents = await fs.readFile(path.join(repoDir, "existing.txt"), "utf8");
    assert.equal(existingContents, "keep me\n");

    const manifest = JSON.parse(await fs.readFile(path.join(repoDir, ".snap", "repository.json"), "utf8")) as unknown;
    assert.deepEqual(manifest, { format: 1, frontier: [], patches: [] });

    const reinit = await initRepository({ cwd: root, targetPath: "repo" }, ports);
    assert.equal(reinit.ok, false);
    if (!reinit.ok) {
      assert.equal(reinit.error.detail, "repository already exists");
    }

    const childDir = path.join(repoDir, "child");
    const insideExisting = await initRepository({ cwd: repoDir, targetPath: "child" }, ports);
    assert.equal(insideExisting.ok, false);
    if (!insideExisting.ok) {
      assert.equal(insideExisting.error.detail, "cannot initialize inside repository");
    }
    await assert.rejects(fs.access(path.join(childDir, ".snap")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: symlinked directories are not treated as directories (not followed)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-symlink-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const realDir = path.join(root, "real");
    await fs.mkdir(realDir);
    const linkPath = path.join(root, "link");
    try {
      await fs.symlink(realDir, linkPath, "junction");
    } catch {
      // In environments where symlink creation is restricted, skip
      return;
    }
    assert.equal(await fileSystem.isDirectory(linkPath), false);
    assert.equal(await fileSystem.pathExists(linkPath), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

