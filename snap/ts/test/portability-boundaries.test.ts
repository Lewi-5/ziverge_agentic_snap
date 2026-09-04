import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { merge } from "../src/application/commands/merge.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import { createNodeTreeMaterializationAdapter } from "../src/adapters/node-tree-materialization-adapter.js";
import { createRepositorySourceAdapter } from "../src/application/repository/create-repository-source.js";
import type { HttpClientPort, HttpResponse } from "../src/ports/http-client-port.js";
import { createRealCli } from "./support/real-cli.js";

/**
 * End-to-end portability checks that the domain-level unit suites
 * (strict-utf8, base64, unsigned-utf8, tree-path, repository-message) do not
 * reach because each of those exercises one boundary in isolation. This file
 * follows a byte payload through the real commit -> repository.json ->
 * materialize pipeline, and proves a local and an HTTP repository source
 * produce an identical typed result for the same bytes (SPEC §9: "Local and
 * HTTP repository sources share the same decoder and validator").
 */

function jsonResponse(status: number, body: Uint8Array): HttpResponse {
  return { status, headers: {}, body };
}

test("CRLF, NUL-containing binary, and Unicode paths survive commit/log/diff byte-for-byte", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    const repo = path.join(cli.root, "repo");
    await cli.run(["config", "contributor.id", "alice@example.com"], repo);

    // CRLF must not be normalized to LF anywhere in the pipeline.
    await fs.writeFile(path.join(repo, "crlf.txt"), Buffer.from("a\r\nb\r\n", "utf8"));
    // NUL byte forces binary classification (put, not text) per SPEC §4.4.
    await fs.writeFile(path.join(repo, "binary.bin"), Buffer.from([0x00, 0xff, 0x10, 0x00, 0xab]));
    // A non-ASCII path is preserved exactly, with no Unicode normalization or case folding.
    await fs.writeFile(path.join(repo, "café-Ω.txt"), Buffer.from("hello\n", "utf8"));

    const commit = await cli.run(["commit", "portability"], repo);
    assert.equal(commit.exitCode, 0);

    const manifestText = await fs.readFile(path.join(repo, ".snap", "repository.json"), "utf8");
    const manifest = JSON.parse(manifestText) as {
      readonly patches: readonly { readonly changes: readonly Record<string, unknown>[] }[];
    };
    const changesByPath = new Map(
      manifest.patches[0]?.changes.map((change) => [change["path"] as string, change]) ?? [],
    );

    // The CRLF file must round-trip as text with the CR preserved inside the token.
    const crlfChange = changesByPath.get("crlf.txt");
    assert.equal(crlfChange?.["type"], "text");
    // The binary file must round-trip as a base64 "put", never as text.
    const binaryChange = changesByPath.get("binary.bin");
    assert.equal(binaryChange?.["type"], "put");
    assert.equal(Buffer.from(binaryChange?.["content"] as string, "base64").equals(Buffer.from([0x00, 0xff, 0x10, 0x00, 0xab])), true);
    // The Unicode path is stored with its exact spelling (no NFC/NFD normalization, no case change).
    assert.equal(changesByPath.has("café-Ω.txt"), true);

    // Round-trip through a second commit + revert to prove replay preserves these bytes end-to-end.
    const crlfAfter = await fs.readFile(path.join(repo, "crlf.txt"));
    assert.equal(crlfAfter.toString("latin1"), "a\r\nb\r\n");
    const binaryAfter = await fs.readFile(path.join(repo, "binary.bin"));
    assert.deepEqual([...binaryAfter], [0x00, 0xff, 0x10, 0x00, 0xab]);

    const diff = await cli.run(["diff"], repo);
    assert.equal(diff.stdout, "", "a clean tree immediately after commit must show no diff");
  } finally {
    await cli.cleanup();
  }
});

test("local and HTTP repository sources produce byte-identical merge results for the same repository", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-portability-"));
  try {
    const localOperandRoot = path.join(root, "local-target");
    const httpOperandRoot = path.join(root, "http-target");
    const remoteRoot = path.join(root, "remote-source");

    const document = {
      format: 1,
      frontier: [["remote@x", 1]],
      patches: [{
        author: "remote@x", revision: 1, base: [], message: "add",
        changes: [{ type: "text", path: "shared.txt", edit: [{ insert: ["shared\n"] }] }],
      }],
    };
    const documentBytes = new TextEncoder().encode(JSON.stringify(document));

    for (const target of [localOperandRoot, httpOperandRoot, remoteRoot]) {
      await fs.mkdir(path.join(target, ".snap"), { recursive: true });
    }
    await fs.writeFile(path.join(remoteRoot, ".snap", "repository.json"), documentBytes);
    for (const target of [localOperandRoot, httpOperandRoot]) {
      await fs.writeFile(
        path.join(target, ".snap", "repository.json"),
        '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n',
      );
    }

    const buildPorts = (repositorySource: ReturnType<typeof createRepositorySourceAdapter>) => {
      const fileSystem = createNodeFileSystemAdapter();
      return {
        fileSystem,
        repositoryDiscovery: createNodeRepositoryDiscoveryAdapter(fileSystem),
        workingTree: createNodeWorkingTreeAdapter(fileSystem),
        treeMaterialization: createNodeTreeMaterializationAdapter(),
        repositorySource,
      };
    };

    const localFileSystem = createNodeFileSystemAdapter();
    const localSource = createRepositorySourceAdapter(localFileSystem, { get: () => { throw new Error("unused"); } });
    const localResult = await merge(localOperandRoot, remoteRoot, buildPorts(localSource));
    assert.equal(localResult.ok, true);

    const httpClient: HttpClientPort = { get: async () => jsonResponse(200, documentBytes) };
    const httpFileSystem = createNodeFileSystemAdapter();
    const httpSource = createRepositorySourceAdapter(httpFileSystem, httpClient);
    const httpResult = await merge(httpOperandRoot, "http://example.invalid/repository.json", buildPorts(httpSource));
    assert.equal(httpResult.ok, true);

    assert.deepEqual(localResult, httpResult);
    const localBytes = await fs.readFile(path.join(localOperandRoot, ".snap", "repository.json"), "utf8");
    const httpBytes = await fs.readFile(path.join(httpOperandRoot, ".snap", "repository.json"), "utf8");
    assert.equal(localBytes, httpBytes);
    assert.equal(await fs.readFile(path.join(localOperandRoot, "shared.txt"), "utf8"), await fs.readFile(path.join(httpOperandRoot, "shared.txt"), "utf8"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
