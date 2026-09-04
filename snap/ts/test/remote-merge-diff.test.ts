import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRepositorySourceAdapter } from "../src/application/repository/create-repository-source.js";
import { loadRemoteRepository } from "../src/application/repository/load-remote-repository.js";
import { merge } from "../src/application/commands/merge.js";
import { diffAcrossRepositories } from "../src/application/commands/diff.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import { createNodeTreeMaterializationAdapter } from "../src/adapters/node-tree-materialization-adapter.js";
import type { HttpClientPort, HttpResponse } from "../src/ports/http-client-port.js";

interface FakeHttpClient {
  readonly port: HttpClientPort;
  readonly requests: string[];
}

function createFakeHttpClient(respond: (url: string) => HttpResponse | Promise<HttpResponse>): FakeHttpClient {
  const requests: string[] = [];
  return {
    requests,
    port: {
      async get(url: string): Promise<HttpResponse> {
        requests.push(url);
        return respond(url);
      },
    },
  };
}

function jsonResponse(status: number, body: string, headers: Readonly<Record<string, string>> = {}): HttpResponse {
  return { status, headers, body: new TextEncoder().encode(body) };
}

const VALID_REMOTE_REPO = JSON.stringify({
  format: 1,
  frontier: [["remote@x", 1]],
  patches: [
    {
      author: "remote@x",
      revision: 1,
      base: [],
      message: "remote",
      changes: [{ type: "text", path: "file.txt", edit: [{ insert: ["remote\n"] }] }],
    },
  ],
});

test("loadRemoteRepository requires exactly HTTP 200 and reports the status in its detail", async () => {
  const client = createFakeHttpClient(() => jsonResponse(302, "moved", { location: "/elsewhere" }));
  const result = await loadRemoteRepository("http://example.invalid/repository.json", { httpClient: client.port });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.detail, /HTTP 302/);
  assert.deepEqual(client.requests, ["http://example.invalid/repository.json"]);
});

test("loadRemoteRepository routes malformed JSON through the shared decoder", async () => {
  const client = createFakeHttpClient(() => jsonResponse(200, "not-json"));
  const result = await loadRemoteRepository("http://example.invalid/repository.json", { httpClient: client.port });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.detail, /invalid JSON/);
});

test("loadRemoteRepository routes schema violations through the shared validator", async () => {
  const client = createFakeHttpClient(() => jsonResponse(200, '{"format":1,"frontier":[],"patches":[],"bad":true}'));
  const result = await loadRemoteRepository("http://example.invalid/repository.json", { httpClient: client.port });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.detail, /unknown field/);
});

test("loadRemoteRepository succeeds on exactly one HTTP 200 GET with a valid repository", async () => {
  const client = createFakeHttpClient(() => jsonResponse(200, VALID_REMOTE_REPO));
  const result = await loadRemoteRepository("http://example.invalid/repository.json", { httpClient: client.port });
  assert.equal(result.ok, true);
  assert.equal(client.requests.length, 1);
});

async function setupLocalRepo(): Promise<{ root: string; ports: { fileSystem: ReturnType<typeof createNodeFileSystemAdapter>; repositoryDiscovery: ReturnType<typeof createNodeRepositoryDiscoveryAdapter>; workingTree: ReturnType<typeof createNodeWorkingTreeAdapter>; treeMaterialization: ReturnType<typeof createNodeTreeMaterializationAdapter> } }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-remote-"));
  const repoDir = path.join(root, "local");
  await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
  await fs.writeFile(path.join(repoDir, ".snap", "repository.json"), '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n', "utf8");
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);
  const treeMaterialization = createNodeTreeMaterializationAdapter();
  return { root: repoDir, ports: { fileSystem, repositoryDiscovery, workingTree, treeMaterialization } };
}

test("remote merge materializes a valid remote repository's patches into the local working tree", async () => {
  const { root, ports } = await setupLocalRepo();
  const client = createFakeHttpClient(() => jsonResponse(200, VALID_REMOTE_REPO));
  const repositorySource = createRepositorySourceAdapter(ports.fileSystem, client.port);

  const result = await merge(root, "http://example.invalid/repository.json", { ...ports, repositorySource });
  assert.equal(result.ok, true);
  assert.equal(client.requests.length, 1);

  const fileText = await fs.readFile(path.join(root, "file.txt"), "utf8");
  assert.equal(fileText, "remote\n");
});

test("remote merge failure leaves the local repository and working tree completely untouched", async () => {
  const { root, ports } = await setupLocalRepo();
  const before = await fs.readFile(path.join(root, ".snap", "repository.json"), "utf8");
  const client = createFakeHttpClient(() => jsonResponse(200, "not-json"));
  const repositorySource = createRepositorySourceAdapter(ports.fileSystem, client.port);

  const result = await merge(root, "http://example.invalid/repository.json", { ...ports, repositorySource });
  assert.equal(result.ok, false);

  const after = await fs.readFile(path.join(root, ".snap", "repository.json"), "utf8");
  assert.equal(after, before);
  await assert.rejects(fs.access(path.join(root, "file.txt")));
});

test("remote diff is observational: it never mutates the local repository", async () => {
  const { root, ports } = await setupLocalRepo();
  const client = createFakeHttpClient(() => jsonResponse(200, VALID_REMOTE_REPO));
  const repositorySource = createRepositorySourceAdapter(ports.fileSystem, client.port);

  const result = await diffAcrossRepositories(root, "()", "(remote@x->1)", "http://example.invalid/repository.json", { ...ports, repositorySource });
  assert.equal(result.ok, true);
  assert.equal(client.requests.length, 1);
  await assert.rejects(fs.access(path.join(root, "file.txt")));
});

test("a dot collision between local and remote history is rejected without mutation", async () => {
  const { root, ports } = await setupLocalRepo();
  await fs.writeFile(
    path.join(root, ".snap", "repository.json"),
    JSON.stringify({
      format: 1,
      frontier: [["remote@x", 1]],
      patches: [{ author: "remote@x", revision: 1, base: [], message: "different", changes: [{ type: "text", path: "file.txt", edit: [{ insert: ["local\n"] }] }] }],
    }),
    "utf8",
  );
  const client = createFakeHttpClient(() => jsonResponse(200, VALID_REMOTE_REPO));
  const repositorySource = createRepositorySourceAdapter(ports.fileSystem, client.port);

  const result = await merge(root, "http://example.invalid/repository.json", { ...ports, repositorySource });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.detail, /collision/);
});
