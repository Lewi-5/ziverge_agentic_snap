import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";

async function withTempRepo(build: (root: string) => Promise<void>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-scan-"));
  await build(root);
  return root;
}

test("real filesystem: excludes only the root .snap subtree", async () => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, ".snap", "repository.json"), "{}", "utf8");
    await fs.writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual([...result.value.keys()], ["a.txt"]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: a nested directory literally named .snap is ordinary tracked content", async () => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, ".snap", "repository.json"), "{}", "utf8");
    await fs.mkdir(path.join(dir, "docs", ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, "docs", ".snap", "file"), "nested\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual([...result.value.keys()], ["docs/.snap/file"]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: multi-level empty directories are invisible", async () => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.mkdir(path.join(dir, "empty", "deeper"), { recursive: true });
    await fs.writeFile(path.join(dir, "kept.txt"), "kept\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual([...result.value.keys()], ["kept.txt"]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: preserves exact bytes, including nested entries at any depth", async () => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.mkdir(path.join(dir, "a", "b"), { recursive: true });
    await fs.writeFile(path.join(dir, "a", "b", "c.txt"), Buffer.from([0, 1, 2, 255]));
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual([...(result.value.get("a/b/c.txt") ?? [])], [0, 1, 2, 255]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a symlink to a missing target, without following it", async (context) => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
  });
  try {
    try {
      await fs.symlink("missing-target", path.join(root, "link"));
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.detail, "unsupported working tree entry: link");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a symlink to a real file, identically to a dangling one, without following it", async (context) => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, "real.txt"), "real\n", "utf8");
  });
  try {
    try {
      await fs.symlink(path.join(root, "real.txt"), path.join(root, "link"));
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.detail, "unsupported working tree entry: link");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: an entry at the scan root and a nested entry both use / -separated tracked paths", async () => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.mkdir(path.join(dir, "nested"), { recursive: true });
    await fs.writeFile(path.join(dir, "root.txt"), "root\n", "utf8");
    await fs.writeFile(path.join(dir, "nested", "file.txt"), "nested\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual([...result.value.keys()].sort(), ["nested/file.txt", "root.txt"]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
