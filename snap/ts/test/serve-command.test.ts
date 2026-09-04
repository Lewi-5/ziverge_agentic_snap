import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import http from "node:http";
import { serve } from "../src/application/commands/serve.js";
import { createNodeFileSystemAdapter } from "../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../src/adapters/node-repository-discovery-adapter.js";
import { createNodeHttpServerAdapter } from "../src/adapters/node-http-server-adapter.js";
import type { HttpServerOptions, HttpServerHandle, HttpServerPort } from "../src/ports/http-server-port.js";
import type { SignalPort } from "../src/ports/signal-port.js";

interface FakeSignal {
  readonly port: SignalPort;
  readonly trigger: () => void;
  unregisterCalls: number;
  registeredSignals: readonly ("SIGINT" | "SIGTERM")[] | undefined;
}

function createFakeSignal(): FakeSignal {
  let currentListener: (() => void) | undefined;
  const fake: FakeSignal = {
    port: {
      onSignal(signals, listener) {
        fake.registeredSignals = signals;
        currentListener = listener;
        return () => {
          fake.unregisterCalls += 1;
        };
      },
    },
    trigger: () => currentListener?.(),
    unregisterCalls: 0,
    registeredSignals: undefined,
  };
  return fake;
}

interface CountingHttpServer {
  readonly port: HttpServerPort;
  listenCalls: number;
}

function countingHttpServer(inner: HttpServerPort): CountingHttpServer {
  const counter: CountingHttpServer = {
    listenCalls: 0,
    port: {
      async listen(options: HttpServerOptions): Promise<HttpServerHandle> {
        counter.listenCalls += 1;
        return inner.listen(options);
      },
    },
  };
  return counter;
}

async function setupRepo(text: string): Promise<{ root: string; ports: { fileSystem: ReturnType<typeof createNodeFileSystemAdapter>; repositoryDiscovery: ReturnType<typeof createNodeRepositoryDiscoveryAdapter> }; repoDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-serve-"));
  const repoDir = path.join(root, "repo");
  await fs.mkdir(path.join(repoDir, ".snap"), { recursive: true });
  await fs.writeFile(path.join(repoDir, ".snap", "repository.json"), text, "utf8");
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  return { root, repoDir, ports: { fileSystem, repositoryDiscovery } };
}

function httpGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

const VALID_REPO = '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n';

test("serve validates before binding a socket: an invalid repository never calls listen", async () => {
  const { repoDir, ports } = await setupRepo('{"format":1,"frontier":[],"patches":[],"bad":true}\n');
  const counter = countingHttpServer(createNodeHttpServerAdapter());
  const signal = createFakeSignal();

  const result = await serve(repoDir, 0, { ...ports, httpServer: counter.port, signal: signal.port });

  assert.equal(result.ok, false);
  assert.equal(counter.listenCalls, 0);
});

test("serve binds loopback on an ephemeral port and serves the immutable startup snapshot", async () => {
  const { repoDir, ports } = await setupRepo(VALID_REPO);
  const signal = createFakeSignal();

  const result = await serve(repoDir, 0, { ...ports, httpServer: createNodeHttpServerAdapter(), signal: signal.port });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.match(result.value.url, /^http:\/\/127\.0\.0\.1:\d+\/repository\.json$/);

  try {
    const first = await httpGet(result.value.url);
    assert.equal(first.status, 200);
    assert.equal(first.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(first.body.toString("utf8"), VALID_REPO);

    // Mutate the on-disk repository after startup; the served snapshot must not change (SPEC §9).
    await fs.writeFile(path.join(repoDir, ".snap", "repository.json"), '{\n  "format": 1,\n  "frontier": [],\n  "patches": [],\n  "extra": true\n}\n', "utf8");

    const second = await httpGet(result.value.url);
    assert.equal(second.body.toString("utf8"), VALID_REPO);
  } finally {
    signal.trigger();
    await result.value.closed;
  }
});

test("serve closes cleanly and unregisters its listener exactly once on a shutdown signal", async () => {
  const { repoDir, ports } = await setupRepo(VALID_REPO);
  const signal = createFakeSignal();

  const result = await serve(repoDir, 0, { ...ports, httpServer: createNodeHttpServerAdapter(), signal: signal.port });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(signal.registeredSignals, ["SIGINT", "SIGTERM"]);

  signal.trigger();
  await result.value.closed;
  assert.equal(signal.unregisterCalls, 1);

  // A duplicate/near-simultaneous signal must not double-close or throw.
  signal.trigger();
  assert.equal(signal.unregisterCalls, 1);
});
