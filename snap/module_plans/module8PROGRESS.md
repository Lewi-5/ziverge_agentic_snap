# Module 8 Progress: Embedded HTTP and Remote Repositories

## Status

**Partially Implemented (Independent Network Adapters Complete)**

The independent network boundary and HTTP adapters for M8 were implemented ahead of M5/M6 in accordance with the architecture plan. All new components pass strict TypeScript type checks, zero-warning ESLint rules, and 10 dedicated unit tests.

---

## Completed Components

### 1. HTTP Server Port & Adapter (`src/ports/http-server-port.ts`, `src/adapters/node-http-server-adapter.ts`)
- Defined `HttpServerPort`:
  ```typescript
  export interface HttpServerOptions {
    readonly host: string;
    readonly port: number;
    readonly snapshotBytes: Uint8Array;
  }
  export interface HttpServerHandle {
    readonly port: number;
    readonly close: () => Promise<void>;
  }
  export interface HttpServerPort {
    readonly listen: (options: HttpServerOptions) => Promise<HttpServerHandle>;
  }
  ```
- Implemented `createNodeHttpServerAdapter()` using Node's built-in `node:http`:
  - Strictly binds loopback `127.0.0.1` and requested port (including ephemeral port 0).
  - Matches origin-form request targets before method evaluation per SPEC §9:
    - `GET /repository.json`: responds with HTTP 200, `Content-Type: application/json; charset=utf-8`, and immutable snapshot bytes.
    - `HEAD /repository.json`: responds with HTTP 200 and identical headers with an exact zero-byte body.
    - Any query string (e.g. `/repository.json?x=1`) or non-matching path: responds with HTTP 404.
    - Other HTTP methods (POST, PUT, DELETE, etc.) on `/repository.json`: responds with HTTP 405 and `Allow: GET, HEAD`.
  - Graceful connection teardown via `handle.close()` (`server.closeAllConnections()` when available).

### 2. HTTP Client Port & Adapter (`src/ports/http-client-port.ts`, `src/adapters/node-http-client-adapter.ts`)
- Defined `HttpClientPort` and `HttpResponse`:
  ```typescript
  export interface HttpResponse {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: Uint8Array;
  }
  export interface HttpClientPort {
    readonly get: (url: string) => Promise<HttpResponse>;
  }
  ```
- Implemented `createNodeHttpClientAdapter()` using Node's `node:http` and `node:https`:
  - Issues a single GET request without following redirects (exposes 3xx status codes directly).
  - Streams response chunks and buffers them into an immutable `Uint8Array`.
  - Zero external dependencies.

### 3. Signal Port & Adapter (`src/ports/signal-port.ts`, `src/adapters/node-signal-adapter.ts`)
- Defined `SignalPort` for registering signal listeners:
  ```typescript
  export interface SignalPort {
    readonly onSignal: (signals: readonly ("SIGINT" | "SIGTERM")[], listener: () => void) => () => void;
  }
  ```
- Implemented `createNodeSignalAdapter()` with an idempotent unsubscribe function to ensure listeners do not leak across tests or command runs.

### 4. Repository Source Classification (`src/application/repository/source.ts`)
- Implemented `classifyRepositorySource(operand: string): RepositorySource`:
  - Classifies operands with exact `"http://"` or `"https://"` prefixes as remote HTTP sources.
  - Classifies all other operands as local repository paths.

### 5. Unit Tests
- `test/node-http-server-adapter.test.ts`: ephemeral port binding, GET snapshot bytes, HEAD zero-body bytes, 404 path/query rejection, 405 method rejection (4 tests).
- `test/node-http-client-adapter.test.ts`: single GET body streaming and redirect non-following (2 tests).
- `test/node-signal-adapter.test.ts`: listener registration and idempotent unsubscription (1 test).
- `test/repository-source-classification.test.ts`: remote vs local URL and path classification (3 tests).

---

## Remaining Work for M8 Completion

1. **Serve Command Use Case & CLI Integration**:
   - Implement `src/application/commands/serve.ts`:
     - Load and validate local repository using M5's full validator.
     - Serialize snapshot to canonical 2-space indented JSON + LF.
     - Call `httpServerPort.listen()`.
     - Write the plain startup URL to stdout (`http://127.0.0.1:<port>/repository.json\n`) and flush before waiting.
     - Subscribe to `SIGINT` and `SIGTERM` via `SignalPort` to gracefully close the server and exit 0.
   - Wire `snap --serve [port]` handler into CLI dispatch.
2. **Remote Repository Loading for Merge & Diff**:
   - Implement `loadRemoteRepository(url, ports)`:
     - Fetch via `httpClientPort.get()`.
     - Verify HTTP status 200 (fail with detail on non-200, e.g. `HTTP 302` or `HTTP 404`).
     - Feed bytes into the shared JSON decoder and M5 full repository validator.
   - Wire remote repository operands into `snap merge <url>` and `snap diff <old> <new> --repo <url>`.
3. **Public Acceptance Verification**:
   - Run and pass public scenarios:
     - `snap/tests/12-remote-merge.yaml`
     - `snap/tests/13-remote-diff.yaml`
     - `snap/tests/26-remote-errors.yaml`
     - `snap/tests/28-terminal-mode.yaml` (serve lifecycle with plain startup URL)
