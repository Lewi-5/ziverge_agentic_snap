import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";

test("readFileIfExists returns exact bytes for an existing file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-read-bytes-"));
  try {
    const target = path.join(root, "config.json");
    const expected = new Uint8Array([0x00, 0x7f, 0x80, 0xff]);
    await fs.writeFile(target, expected);

    const actual = await createNodeFileSystemAdapter().readFileIfExists(target);
    assert.ok(actual instanceof Uint8Array);
    assert.deepEqual(actual, expected);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readFileIfExists returns null only for ENOENT and ENOTDIR paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-read-missing-"));
  try {
    const adapter = createNodeFileSystemAdapter();
    assert.equal(await adapter.readFileIfExists(path.join(root, "missing.json")), null);

    const fileParent = path.join(root, "ordinary-file");
    await fs.writeFile(fileParent, "content", "utf8");
    assert.equal(await adapter.readFileIfExists(path.join(fileParent, "config.json")), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readFileIfExists propagates non-missing filesystem errors", async (context) => {
  if (process.platform === "freebsd") {
    context.skip("FreeBSD permits reading a directory as bytes");
    return;
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-read-error-"));
  try {
    await assert.rejects(createNodeFileSystemAdapter().readFileIfExists(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
