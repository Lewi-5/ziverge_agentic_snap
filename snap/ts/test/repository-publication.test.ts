import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { publishRepository } from "../src/application/repository/publish-repository.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { EMPTY_VERSION } from "../src/domain/version/types.js";
import type { RepositoryDocument } from "../src/domain/repository/types.js";
import type { FileSystemPort } from "../src/ports/filesystem-port.js";

const EMPTY_DOCUMENT: RepositoryDocument = Object.freeze({ format: 1, frontier: EMPTY_VERSION, patches: Object.freeze([]) });

test("real filesystem: publishes canonical bytes (2-space indent, trailing LF) and replaces the existing file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-publish-"));
  try {
    const snapDir = path.join(root, ".snap");
    await fs.mkdir(snapDir, { recursive: true });
    const finalPath = path.join(snapDir, "repository.json");
    await fs.writeFile(finalPath, "stale content", "utf8");

    const fileSystem = createNodeFileSystemAdapter();
    await publishRepository(root, EMPTY_DOCUMENT, { fileSystem });

    const bytes = await fs.readFile(finalPath, "utf8");
    assert.equal(bytes, '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n');

    const remaining = await fs.readdir(snapDir);
    assert.deepEqual(remaining, ["repository.json"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a failure between the temp write and the rename leaves the original file byte-unchanged and cleans up the temp file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-publish-fail-"));
  try {
    const snapDir = path.join(root, ".snap");
    await fs.mkdir(snapDir, { recursive: true });
    const finalPath = path.join(snapDir, "repository.json");
    const originalBytes = '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n';
    await fs.writeFile(finalPath, originalBytes, "utf8");

    const real = createNodeFileSystemAdapter();
    let removedTempPath: string | undefined;
    const fileSystem: FileSystemPort = {
      ...real,
      renameFile: () => {
        throw new Error("simulated failure between write and rename");
      },
      removeFileIfExists: async (candidate) => {
        removedTempPath = candidate;
        await real.removeFileIfExists(candidate);
      },
    };

    await assert.rejects(
      publishRepository(root, EMPTY_DOCUMENT, { fileSystem }),
      /simulated failure between write and rename/,
    );

    const afterBytes = await fs.readFile(finalPath, "utf8");
    assert.equal(afterBytes, originalBytes);

    assert.equal(removedTempPath !== undefined, true);
    const remaining = await fs.readdir(snapDir);
    assert.deepEqual(remaining, ["repository.json"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a failure during the durable temp write never touches the existing file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-publish-write-fail-"));
  try {
    const snapDir = path.join(root, ".snap");
    await fs.mkdir(snapDir, { recursive: true });
    const finalPath = path.join(snapDir, "repository.json");
    const originalBytes = "original\n";
    await fs.writeFile(finalPath, originalBytes, "utf8");

    const real = createNodeFileSystemAdapter();
    const fileSystem: FileSystemPort = {
      ...real,
      writeFileDurable: () => {
        throw new Error("simulated write failure");
      },
    };

    await assert.rejects(publishRepository(root, EMPTY_DOCUMENT, { fileSystem }), /simulated write failure/);

    const afterBytes = await fs.readFile(finalPath, "utf8");
    assert.equal(afterBytes, originalBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
