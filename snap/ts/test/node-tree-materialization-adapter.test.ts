import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeTreeMaterializationAdapter } from "../src/adapters/node-tree-materialization-adapter.js";

async function withTempDir(action: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-materialize-test-"));
  try {
    await action(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("materialization adapter: writes files and creates parent directories", async () => {
  await withTempDir(async (root) => {
    const adapter = createNodeTreeMaterializationAdapter();
    const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

    await adapter.apply(root, {
      removals: [],
      writes: [{ path: "deep/nested/dir/hello.txt", bytes: content }],
    });

    const written = await fs.readFile(path.join(root, "deep/nested/dir/hello.txt"));
    assert.deepEqual(new Uint8Array(written.buffer, written.byteOffset, written.byteLength), content);
  });
});

test("materialization adapter: removes files and prunes empty parents up to repository root", async () => {
  await withTempDir(async (root) => {
    const filePath = path.join(root, "deep/nested/dir/hello.txt");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "content", "utf8");

    const adapter = createNodeTreeMaterializationAdapter();
    await adapter.apply(root, {
      removals: ["deep/nested/dir/hello.txt"],
      writes: [],
    });

    // hello.txt should be gone
    await assert.rejects(fs.stat(filePath));
    // empty parent directories deep/nested/dir should be pruned
    await assert.rejects(fs.stat(path.join(root, "deep")));
    // repository root itself must NOT be pruned
    const rootStat = await fs.stat(root);
    assert.equal(rootStat.isDirectory(), true);
  });
});

test("materialization adapter: handles file-to-directory and directory-to-file transitions", async () => {
  await withTempDir(async (root) => {
    const adapter = createNodeTreeMaterializationAdapter();

    // 1. Initially create file 'a'
    await adapter.apply(root, {
      removals: [],
      writes: [{ path: "a", bytes: new Uint8Array([1]) }],
    });

    // 2. Transition file 'a' to directory with 'a/b'
    await adapter.apply(root, {
      removals: ["a"],
      writes: [{ path: "a/b", bytes: new Uint8Array([2]) }],
    });
    const ab = await fs.readFile(path.join(root, "a/b"));
    assert.deepEqual([...ab], [2]);

    // 3. Transition directory 'a' with 'a/b' back to file 'a'
    await adapter.apply(root, {
      removals: ["a/b"],
      writes: [{ path: "a", bytes: new Uint8Array([3]) }],
    });
    const a = await fs.readFile(path.join(root, "a"));
    assert.deepEqual([...a], [3]);
  });
});

test("materialization adapter: refuses to write or remove Snap metadata (.snap)", async () => {
  await withTempDir(async (root) => {
    const adapter = createNodeTreeMaterializationAdapter();

    await assert.rejects(
      adapter.apply(root, { removals: [], writes: [{ path: ".snap/file.txt", bytes: new Uint8Array([1]) }] }),
      /refusing to materialize Snap metadata/,
    );

    await assert.rejects(
      adapter.apply(root, { removals: [".snap/repository.json"], writes: [] }),
      /refusing to materialize Snap metadata/,
    );
  });
});

test("materialization adapter: refuses tracked paths that escape repository", async () => {
  await withTempDir(async (root) => {
    const adapter = createNodeTreeMaterializationAdapter();

    await assert.rejects(
      adapter.apply(root, { removals: [], writes: [{ path: "../outside.txt", bytes: new Uint8Array([1]) }] }),
      /tracked path escapes repository/,
    );
  });
});

test("materialization adapter: refuses writing through a directory symlink on POSIX", async (context) => {
  if (process.platform === "win32") {
    context.skip("Symlink creation is restricted on Windows");
    return;
  }
  await withTempDir(async (root) => {
    const realDir = path.join(root, "real_dir");
    const linkDir = path.join(root, "link_dir");
    await fs.mkdir(realDir);
    try {
      await fs.symlink(realDir, linkDir);
    } catch {
      context.skip("Symlink creation is restricted in this environment");
      return;
    }

    const adapter = createNodeTreeMaterializationAdapter();
    await assert.rejects(
      adapter.apply(root, { removals: [], writes: [{ path: "link_dir/file.txt", bytes: new Uint8Array([1]) }] }),
      /unsupported working tree entry/,
    );
  });
});

test("materialization adapter: refuses to overwrite a FIFO on POSIX", async (context) => {
  if (process.platform === "win32") {
    context.skip("FIFOs are not supported on Windows");
    return;
  }
  await withTempDir(async (root) => {
    const fifoPath = path.join(root, "pipe");
    const res = spawnSync("mkfifo", [fifoPath]);
    if (res.status !== 0) {
      context.skip("mkfifo is not available in this environment");
      return;
    }

    const adapter = createNodeTreeMaterializationAdapter();
    await assert.rejects(
      adapter.apply(root, { removals: [], writes: [{ path: "pipe", bytes: new Uint8Array([1]) }] }),
      /unsupported working tree entry: pipe/,
    );
  });
});

test("materialization adapter: refuses to overwrite a Unix domain socket on POSIX", async (context) => {
  if (process.platform === "win32") {
    context.skip("Unix domain sockets are not supported on Windows");
    return;
  }
  await withTempDir(async (root) => {
    const socketPath = path.join(root, "server.sock");
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, () => resolve());
      server.on("error", reject);
    });

    try {
      const adapter = createNodeTreeMaterializationAdapter();
      await assert.rejects(
        adapter.apply(root, { removals: [], writes: [{ path: "server.sock", bytes: new Uint8Array([1]) }] }),
        /unsupported working tree entry: server\.sock/,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

test("materialization adapter: refuses to remove a symlink target", async (context) => {
  if (process.platform === "win32") {
    context.skip("Symlink creation is restricted on Windows");
    return;
  }
  await withTempDir(async (root) => {
    const targetFile = path.join(root, "real.txt");
    const linkFile = path.join(root, "link.txt");
    await fs.writeFile(targetFile, "real", "utf8");
    try {
      await fs.symlink(targetFile, linkFile);
    } catch {
      context.skip("Symlink creation is restricted in this environment");
      return;
    }

    const adapter = createNodeTreeMaterializationAdapter();
    // Materialization plan asks to remove link.txt, but link.txt is a symlink, not a regular file!
    await assert.rejects(
      adapter.apply(root, { removals: ["link.txt"], writes: [] }),
      /unsupported working tree entry: link\.txt/,
    );
    // Ensure the symlink and target file were NOT unlinked
    const stat = await fs.lstat(linkFile);
    assert.equal(stat.isSymbolicLink(), true);
  });
});
