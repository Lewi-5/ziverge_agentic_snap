import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { initRepository } from "../src/application/init-repository.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createRealCli } from "./support/real-cli.js";

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

    const manifestText = await fs.readFile(path.join(repoDir, ".snap", "repository.json"), "utf8");
    assert.equal(manifestText, '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n');
    const manifest = JSON.parse(manifestText) as unknown;
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

    const outsideTarget = path.join(repoDir, "new", "child");
    const outsideToInside = await initRepository({ cwd: root, targetPath: "repo/new/child" }, ports);
    assert.equal(outsideToInside.ok, false);
    if (!outsideToInside.ok) {
      assert.equal(outsideToInside.error.detail, "cannot initialize inside repository");
    }
    await assert.rejects(fs.access(path.join(outsideTarget, ".snap")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: symlinked directories are not treated as directories (not followed)", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-symlink-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const realDir = path.join(root, "real");
    await fs.mkdir(realDir);
    const linkPath = path.join(root, "link");
    try {
      await fs.symlink(realDir, linkPath, "junction");
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }
    assert.equal(await fileSystem.isDirectory(linkPath), false);
    assert.equal(await fileSystem.pathExists(linkPath), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: repository discovery rejects a symlinked path component", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-discovery-symlink-"));
  try {
    const fileSystem = createNodeFileSystemAdapter();
    const discovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const realDir = path.join(root, "real");
    const nested = path.join(realDir, "nested");
    await fs.mkdir(nested, { recursive: true });
    const linkPath = path.join(root, "link");
    try {
      await fs.symlink(realDir, linkPath, "junction");
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }

    await assert.rejects(
      discovery.findRepositoryRoot(path.join(linkPath, "nested")),
      /repository discovery does not follow symbolic links/u,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem end-to-end: init -> global config -> local config overrides it -> commit (scenario 03's precedence shape)", async () => {
  const cli = await createRealCli();
  try {
    const globalConfig = await cli.run(["config", "--global", "contributor.id", "global@example.com"]);
    assert.equal(globalConfig.exitCode, 0);

    await cli.run(["init", "local"]);
    const localConfig = await cli.run(["config", "contributor.id", "local@example.com"], `${cli.root}/local`);
    assert.equal(localConfig.exitCode, 0);

    await cli.writeFile("local/file.txt", "local\n");
    const localCommit = await cli.run(["commit", "local-wins"], `${cli.root}/local`);
    assert.equal(localCommit.exitCode, 0);
    assert.equal(localCommit.stdout, "(local@example.com->1)\n");

    // A second repository with no local config falls back to the (still valid) global one.
    await cli.run(["init", "global"]);
    await cli.writeFile("global/file.txt", "global\n");
    const globalCommit = await cli.run(["commit", "global-fallback"], `${cli.root}/global`);
    assert.equal(globalCommit.exitCode, 0);
    assert.equal(globalCommit.stdout, "(global@example.com->1)\n");

    // Once local config is malformed, it strictly blocks the global fallback, even though global is valid.
    await cli.writeFile("local/.snap/config.json", "not json");
    await cli.writeFile("local/file.txt", "local2\n");
    const blocked = await cli.run(["commit", "should-fail"], `${cli.root}/local`);
    assert.equal(blocked.exitCode, 1);
    assert.match(blocked.stderr, /invalid JSON/);
  } finally {
    await cli.cleanup();
  }
});
