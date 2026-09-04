import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "../src/cli/dispatch.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeHttpServerAdapter } from "../src/adapters/node-http-server-adapter.js";
import { createNodeEnvironmentAdapter } from "../src/adapters/node-environment-adapter.js";
import { createNodeWorkingTreeAdapter } from "../src/adapters/node-working-tree-adapter.js";
import type { SignalPort } from "../src/ports/signal-port.js";
import type { OutputPort } from "../src/ports/output-port.js";
import type { HttpServerPort } from "../src/ports/http-server-port.js";

interface FakeSignal {
  readonly port: SignalPort;
  readonly trigger: () => void;
}

function createFakeSignal(): FakeSignal {
  let currentListener: (() => void) | undefined;
  return {
    port: {
      onSignal(_signals, listener) {
        currentListener = listener;
        return () => {
          currentListener = undefined;
        };
      },
    },
    trigger: () => currentListener?.(),
  };
}

interface RecordingOutput {
  readonly port: OutputPort;
  readonly writes: string[];
}

function createRecordingOutput(): RecordingOutput {
  const writes: string[] = [];
  return {
    writes,
    port: {
      async write(text: string): Promise<void> {
        writes.push(text);
      },
    },
  };
}

async function setupRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-presentation-"));
  const repoDir = path.join(root, "repo");
  await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
  await fs.writeFile(path.join(repoDir, ".snap", "repository.json"), '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n', "utf8");
  return repoDir;
}

test("serve flushes the startup URL before waiting for shutdown, and the URL stays plain under SNAP_COLOR=always", async () => {
  const cwd = await setupRepo();
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const httpServer = createNodeHttpServerAdapter();
  const signal = createFakeSignal();
  const output = createRecordingOutput();
  const environment = createNodeEnvironmentAdapter({ SNAP_COLOR: "always" });
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);

  const outcomePromise = runCli({
    argv: ["--serve", "0"],
    cwd,
    ports: { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal: signal.port, output: output.port },
  });

  // The startup URL must be flushed (via the output port) while the server
  // is still running and runCli has not yet resolved.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(output.writes.length, 1);
  assert.match(output.writes[0] ?? "", /^http:\/\/127\.0\.0\.1:\d+\/repository\.json\n$/);
  assert.doesNotMatch(output.writes[0] ?? "", /\[/);

  signal.trigger();
  const outcome = await outcomePromise;
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, "");
});

test("serve reports an invalid startup repository without binding a socket or writing any output", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-presentation-invalid-"));
  const repoDir = path.join(root, "repo");
  await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
  await fs.writeFile(path.join(repoDir, ".snap", "repository.json"), '{"format":1,"frontier":[],"patches":[],"bad":true}\n', "utf8");

  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const httpServer = createNodeHttpServerAdapter();
  const signal = createFakeSignal();
  const output = createRecordingOutput();
  const environment = createNodeEnvironmentAdapter({});
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);

  const outcome = await runCli({
    argv: ["--serve", "0"],
    cwd: repoDir,
    ports: { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal: signal.port, output: output.port },
  });

  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.match(outcome.stderr, /^snap: .+\n$/);
  assert.equal(output.writes.length, 0);
});

test("serve reports a socket listen failure as an expected error with exit code 1", async () => {
  const cwd = await setupRepo();
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const failingHttpServer: HttpServerPort = {
    async listen(): Promise<never> {
      throw new Error("listen EADDRINUSE: address already in use 127.0.0.1:8765");
    },
  };
  const signal = createFakeSignal();
  const output = createRecordingOutput();
  const environment = createNodeEnvironmentAdapter({});
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);

  const outcome = await runCli({
    argv: ["--serve", "8765"],
    cwd,
    ports: { fileSystem, repositoryDiscovery, environment, workingTree, httpServer: failingHttpServer, signal: signal.port, output: output.port },
  });

  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.match(outcome.stderr, /^snap: server listen failed: listen EADDRINUSE: address already in use 127\.0\.0\.1:8765\n$/);
  assert.equal(output.writes.length, 0);
});

test("serve reports an invalid port containing control characters as a single escaped line", async () => {
  const cwd = await setupRepo();
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const httpServer = createNodeHttpServerAdapter();
  const signal = createFakeSignal();
  const output = createRecordingOutput();
  const environment = createNodeEnvironmentAdapter({});
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);

  const outcome = await runCli({
    argv: ["--serve", "8765\n"],
    cwd,
    ports: { fileSystem, repositoryDiscovery, environment, workingTree, httpServer, signal: signal.port, output: output.port },
  });

  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.stdout, "");
  assert.equal(outcome.stderr, "snap: invalid port: 8765\\x0a\n");
  assert.equal(output.writes.length, 0);
});
