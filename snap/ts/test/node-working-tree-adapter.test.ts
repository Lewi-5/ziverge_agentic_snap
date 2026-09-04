import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";

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

test("mock filesystem: sorts directory entries deterministically so the first unsupported entry by byte order is reported", async () => {
  const mockFs: FileSystemPort = {
    async entryKind(p: string) {
      if (p.endsWith("z_symlink") || p.endsWith("a_symlink")) return "symlink";
      return "missing";
    },
    async pathExists() {
      return false;
    },
    async isDirectory() {
      return false;
    },
    async mkdirRecursive() {},
    async writeFile() {},
    async readFileIfExists() {
      return null;
    },
    async writeFileDurable() {},
    async renameFile() {},
    async removeFileIfExists() {},
    async listDirectory() {
      // Returns entries in reverse order
      return ["z_symlink", "a_symlink"];
    },
  };

  const scanner = createNodeWorkingTreeAdapter(mockFs);
  const result = await scanner.scan("/mock/repo");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.detail, "unsupported working tree entry: a_symlink");
  }
});

test("real filesystem: rejects a POSIX FIFO (named pipe) without opening or blocking on it", async (context) => {
  if (process.platform === "win32") {
    context.skip("FIFOs are not supported on Windows");
    return;
  }
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
  });
  try {
    const fifoPath = path.join(root, "pipe");
    const res = spawnSync("mkfifo", [fifoPath]);
    if (res.status !== 0) {
      context.skip("mkfifo is not available in this environment");
      return;
    }
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.detail, "unsupported working tree entry: pipe");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a POSIX Unix domain socket without connecting to it", async (context) => {
  if (process.platform === "win32") {
    context.skip("Unix domain sockets are not supported on Windows");
    return;
  }
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
  });
  try {
    const socketPath = path.join(root, "app.sock");
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, () => resolve());
      server.on("error", reject);
    });
    try {
      const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
      const result = await scanner.scan(root);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.detail, "unsupported working tree entry: app.sock");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a symlink cycle without infinite recursion", async (context) => {
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
  });
  try {
    try {
      await fs.symlink(root, path.join(root, "cycle"));
    } catch {
      context.skip("symlink creation is restricted in this environment");
      return;
    }
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.detail, "unsupported working tree entry: cycle");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a file with a backslash in its name on POSIX filesystems", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows does not allow backslashes in filenames");
    return;
  }
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, "bad\\name.txt"), "content\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.detail.includes("tracked path must not contain a backslash"));
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: rejects a file with an ASCII control character in its name with single-line escaping", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows does not allow control characters in filenames");
    return;
  }
  const root = await withTempRepo(async (dir) => {
    await fs.mkdir(path.join(dir, ".snap"), { recursive: true });
    await fs.writeFile(path.join(dir, "bad\nname.txt"), "content\n", "utf8");
  });
  try {
    const scanner = createNodeWorkingTreeAdapter(createNodeFileSystemAdapter());
    const result = await scanner.scan(root);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.detail.includes("tracked path must not contain an ASCII control character"));
      assert.ok(!result.error.detail.includes("\n"), "error detail must remain single-line by escaping newlines");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


