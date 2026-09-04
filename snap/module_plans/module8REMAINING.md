## Completion note (2026-09-04)

All five work packages below are implemented. Type checking, linting, and the emitted-JS unit
suite (378/382, 4 pre-existing Windows symlink skips) pass, including new tests for every bullet
in Work Package 4. Public scenario 26 passes on this Windows host; scenarios 12, 13, and 28 hang at
their `stop` (default `SIGTERM`) step because Windows does not deliver a catchable `SIGTERM` to a
Node child process — verified directly against the compiled binary outside the harness, not just
inside it. See `snap/modules.md`'s M8 row and `module8PROGRESS.md` for full verification evidence
and the exact remaining action (re-run 12/13/28 on a POSIX host). The plan below is left intact as
the historical work breakdown.

# Module 8 Remaining Work: Embedded HTTP and Remote Repositories

## Overview & Current State

Module 8 (**Embedded HTTP and Remote Repositories**) defines the read-only network boundary for Snap (SPEC §§7.6, 7.8–7.11, 9, 10). It introduces the long-running `snap --serve [port]` command with an immutable startup snapshot, and provides an exact, single-request HTTP/HTTPS repository loader for `merge` and cross-repository observational `diff`.

### Completed Primitives (Baseline)
The low-level network adapters and grammar primitives were implemented and unit-tested ahead of time:
- [src/ports/http-server-port.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/ports/http-server-port.ts): Contract for binding and serving the immutable snapshot.
- [src/adapters/node-http-server-adapter.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/adapters/node-http-server-adapter.ts): Built-in `node:http` server strictly binding `127.0.0.1`, matching path `/repository.json` before method, serving GET (200 + snapshot bytes), HEAD (200 + zero-byte body), 404 for query/other paths, and 405 with `Allow: GET, HEAD`.
- [src/ports/http-client-port.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/ports/http-client-port.ts): Contract for single GET byte retrieval without redirects.
- [src/adapters/node-http-client-adapter.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/adapters/node-http-client-adapter.ts): Built-in `node:http`/`node:https` client streaming raw response bytes.
- [src/ports/signal-port.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/ports/signal-port.ts) & [src/adapters/node-signal-adapter.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/adapters/node-signal-adapter.ts): Scoped process `SIGINT`/`SIGTERM` subscription with idempotent listener cleanup.
- [src/application/repository/source.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/application/repository/source.ts): `classifyRepositorySource` partitioning operands into local paths vs. remote `http://` / `https://` URLs.
- [src/cli/grammar.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/cli/grammar.ts) & [src/cli/command-request.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/cli/command-request.ts): Grammar parsing for `--serve [port]` (with port validation 0–65535) producing `ServeRequest`.
- [src/cli/results.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/cli/results.ts), [src/cli/render.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/cli/render.ts), & [src/cli/render-terminal.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/cli/render-terminal.ts): `serve-startup` result kind rendering as an uncolored plain URL in both plain and terminal modes.

### Public Acceptance Exit Gate
- **Scenario 12** (`12-http-server.yaml`): Server startup preparation, immutable snapshot, GET/HEAD/POST/query behavior, post-startup commit immutability, SIGTERM/SIGINT shutdown, invalid startup repository failure.
- **Scenario 13** (`13-http-client.yaml`): Remote diff and merge, single GET without redirects, 302 failure with `HTTP 302` in stderr, invalid JSON rejection.
- **Scenario 26** (`26-portability-and-failure-safety.yaml`): Malformed HTTP repository never mutates local repository or tree; single GET verified via mock server logs.
- **Scenario 28** (`28-terminal-presentation.yaml`): `--serve 0` under `SNAP_COLOR=always` outputs plain startup URL and cleanly terminates on SIGTERM.

---

## Detailed Remaining Work Packages

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Work Package 1: Remote Repository Loading & Source Adapter Integration  │
├─────────────────────────────────────────────────────────────────────────┤
│ Work Package 2: Serve Command Application Logic & Lifecycle             │
├─────────────────────────────────────────────────────────────────────────┤
│ Work Package 3: CLI Wiring, Dispatch & Long-Running Lifecycle Execution │
├─────────────────────────────────────────────────────────────────────────┤
│ Work Package 4: Unit, Integration & Error Injection Test Suite          │
├─────────────────────────────────────────────────────────────────────────┤
│ Work Package 5: Public Acceptance Verification & Tracker Closure        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Work Package 1: Remote Repository Loading & Source Adapter Integration

#### 1. Implement Remote Repository Loader
- **File**: `snap/ts/src/application/repository/load-remote-repository.ts` [NEW]
- **Responsibilities**:
  1. Accept `url: string` and ports `{ readonly httpClient: HttpClientPort }`.
  2. Call `ports.httpClient.get(url)`.
  3. Validate HTTP response status:
     - Require exactly HTTP `200`.
     - Non-200 responses (e.g. `302`, `404`, `500`) must return a domain error whose detail includes `HTTP <status>` (e.g. `HTTP 302` or `HTTP 404`). This is explicitly asserted by scenario 13 (`stderr_contains: HTTP 302`).
  4. Handle transport/network errors (connection refused, DNS failure, reset) by returning a domain error (e.g. `domainError("io", ...)`).
  5. Feed the raw response bytes (`Uint8Array`) into `decodeAndValidateRepositoryBytes(bytes)` from [src/application/repository/decode-repository.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/application/repository/decode-repository.ts).
     - This automatically runs fatal UTF-8 decoding, duplicate-key JSON rejection, schema validation, and full M5 replay validation.
     - Malformed JSON reports `invalid JSON` (asserted by scenario 13).
     - Unknown fields (e.g. `"bad": true`) fail schema validation (asserted by scenario 26).
  6. Return `Result<LoadedRepositorySource, DomainError>`.

#### 2. Upgrade Repository Source Adapter
- **File**: `snap/ts/src/adapters/repository-source-adapter.ts` [REPLACE/EXPAND `local-repository-source-adapter.ts`]
- **Responsibilities**:
  1. Implement [RepositorySourcePort](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/ports/repository-source-port.ts) with dependencies `{ readonly fileSystem: FileSystemPort; readonly httpClient: HttpClientPort }`.
  2. When `source.kind === "local"`, invoke `loadLocalOperand(cwd, source.path, { fileSystem })`.
  3. When `source.kind === "remote"`, invoke `loadRemoteRepository(source.url, { httpClient })`.
  4. Remove the temporary stub error (`remote repository loading is not yet implemented`).

#### 3. Confirm Remote Merge & Diff Non-Mutation Safety
- Verify that both [src/application/commands/merge.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/application/commands/merge.ts) and [src/application/commands/diff.ts](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/application/commands/diff.ts) receive the validated repository via `ports.repositorySource.load(...)`.
- Confirm that in all remote failure paths (network error, HTTP 302, HTTP 404, malformed JSON, schema violation, dot collision), zero local files are touched, no temporary files remain, and `.snap/repository.json` is not updated (SPEC §10, scenario 26).

---

### Work Package 2: Serve Command Application Logic & Lifecycle

#### 1. Implement Application Serve Command
- **File**: `snap/ts/src/application/commands/serve.ts` [NEW]
- **Port Dependencies**:
  ```typescript
  export interface ServePorts {
    readonly fileSystem: FileSystemPort;
    readonly repositoryDiscovery: RepositoryDiscoveryPort;
    readonly httpServer: HttpServerPort;
    readonly signal: SignalPort;
    /** Output callback or port to flush the startup URL to stdout before entering the wait loop. */
    readonly onStartupUrl?: (url: string) => Promise<void> | void;
  }
  ```
- **Lifecycle Sequence**:
  1. **Validation Before Socket Binding**:
     - Discover and load the nearest repository using `loadLocalRepository(cwd, ports)`.
     - Full validation (`decodeAndValidateRepositoryBytes`) must succeed before binding a socket or writing to stdout.
     - If repository discovery or validation fails (e.g. missing repo, invalid JSON, or schema error with `"bad": true`), return an expected `DomainError`. **No socket is bound and no stdout is printed** (scenario 12 step 154-170).
  2. **Canonical Immutable Snapshot**:
     - Serialize the validated repository document canonically:
       `const jsonText = serializeRepositoryDocument(loaded.value.repository.document);`
       `const snapshotBytes = new TextEncoder().encode(jsonText);`
     - Retain these exact immutable bytes for the server lifetime.
     - Commits or file modifications made to the repository on disk after startup MUST NOT change the served snapshot bytes (scenario 12 step 83-129).
  3. **Socket Binding**:
     - Call `ports.httpServer.listen({ host: "127.0.0.1", port, snapshotBytes })`.
     - Note: `port` is the parsed value (default `8765`, explicit port, or ephemeral `0`).
     - Obtain `handle.port` from the returned `HttpServerHandle`.
  4. **Startup URL Publication & Readiness Flush**:
     - Formulate the exact startup URL:
       `http://127.0.0.1:<handle.port>/repository.json`
     - Emit this URL immediately and **await flush** via `onStartupUrl` before entering the long wait.
     - The startup URL MUST always remain plain, even when `SNAP_COLOR=always` (SPEC §7.11, scenario 28).
  5. **Signal Subscription & Clean Shutdown**:
     - Register `SIGINT` and `SIGTERM` handlers via `ports.signal.onSignal(["SIGINT", "SIGTERM"], listener)` *after* listening starts.
     - On either signal:
       - Idempotently invoke `await handle.close()`.
       - Invoke the unregister callback from `onSignal` to remove process listeners.
       - Complete cleanly with exit code 0 and empty stderr (scenario 12 steps 130-139, 147-153).
  6. **Unexpected Server Errors**:
     - Sockets errors, unexpected listen rejections, or runtime crashes clean up and bubble to exit code 2.

---

### Work Package 3: CLI Wiring, Dispatch & Long-Running Lifecycle Execution

#### 1. Wire Ports in CLI Context
- **File**: `snap/ts/src/cli/types.ts` [MODIFY]
  - Add optional ports:
    ```typescript
    export interface CliPorts {
      // ... existing ports ...
      readonly httpServer?: HttpServerPort;
      readonly httpClient?: HttpClientPort;
      readonly signal?: SignalPort;
    }
    ```
- **File**: `snap/ts/src/main.ts` [MODIFY]
  - Instantiate `createNodeHttpServerAdapter()`, `createNodeHttpClientAdapter()`, and `createNodeSignalAdapter()`.
  - Replace `createLocalRepositorySourceAdapter` with `createRepositorySourceAdapter(fileSystem, httpClient)`.
  - Pass all ports into `runCli`.

#### 2. Implement Serve CLI Command Handler
- **File**: `snap/ts/src/cli/commands/serve.ts` [NEW]
  - Wrap `ServeRequest` (`port: number`) and invoke `serve(context.cwd, request.port, ports)`.

#### 3. CLI Dispatch & Immediate Output Flushing
- **File**: `snap/ts/src/cli/dispatch.ts` [MODIFY]
  - Handle `parsed.value.kind === "serve"`:
    - Currently, `commandName` returns `undefined` for `"serve"` and rejects with `GRAMMAR_ERROR`.
    - Route `ServeRequest` to the serve handler.
  - **CRITICAL ARCHITECTURAL REQUIREMENT: Readiness Flush Before Wait**:
    - Standard CLI commands return a `CliOutcome` where `outcome.stdout` is buffered and printed after `runCli()` resolves.
    - However, `snap --serve [port]` is a long-running process that only resolves on `SIGINT`/`SIGTERM`.
    - In test scenario 12 and 28, the test harness runs:
      ```yaml
      - start:
          id: origin
          cwd: repo
          args: [--serve, "0"]
          ready:
            stream: stdout
            pattern: '^(http://127\.0\.0\.1:[0-9]+/repository\.json)\n'
      ```
    - The harness waits for stdout to emit the URL *while the server is still running*. If output is buffered until `runCli` exits, the harness hangs indefinitely and times out.
    - Therefore, `dispatch.ts` / `main.ts` must provide an output callback (e.g. writing directly to `process.stdout` and awaiting drain) so the startup URL is flushed before the server waits for signals.

---

### Work Package 4: Comprehensive Test Suite

Create and run focused automated tests covering all M8 requirements before running the verifier:

#### 1. `test/serve-command.test.ts` [NEW]
- **Port binding**: default `8765`, explicit port, and ephemeral `0`.
- **Validation before listen**: Run serve on a repository with an invalid schema (e.g. `"bad": true`) or syntax error. Assert:
  - Exits with code 1.
  - Emits error message to stderr.
  - Emits NO output to stdout (no startup URL).
  - Binds no socket (server handle never opened).
- **Snapshot immutability**:
  - Start serve on a valid repository.
  - Fetch `GET /repository.json` and verify snapshot bytes.
  - Mutate `.snap/repository.json` on disk (e.g. add a commit or change frontier).
  - Fetch `GET /repository.json` again and verify returned bytes are byte-identical to startup snapshot.
- **Plain URL invariant**:
  - Run with `SNAP_COLOR=always`. Verify emitted startup URL contains no ANSI escape sequences.
- **Signal shutdown**:
  - Emit simulated `SIGINT` and `SIGTERM`.
  - Verify server closes cleanly, listeners are unregistered, and exit code is 0.

#### 2. `test/remote-merge-diff.test.ts` [NEW]
- **Remote diff**:
  - Perform `snap diff () (remote@x->1) --repo http://...`.
  - Verify unified diff output matches expectations without importing patches locally.
- **Remote merge**:
  - Perform `snap merge http://...`.
  - Verify remote patches are joined, working tree is materialized, and metadata updated.
- **HTTP status failure**:
  - Mock server returns HTTP 302 redirect. Assert command exits 1 and stderr contains `HTTP 302`.
  - Mock server returns HTTP 404. Assert command exits 1 and stderr contains `HTTP 404`.
- **Malformed remote repository**:
  - Mock server returns invalid JSON (`not-json`), duplicate JSON keys, or schema errors (`"bad": true`).
  - Assert command exits 1, stderr contains error diagnostic, and local repository/tree has ZERO mutation.
- **Dot collisions**:
  - Mock server returns a patch with same `(author, revision)` but different contents. Assert collision is detected and rejected without mutation.

#### 3. `test/node-http-client-adapter.test.ts` [EXPAND]
- Verify network reset, connection refused, and response error handling.
- Verify redirect responses (301, 302, 307, 308) with `Location` header are NOT followed.

#### 4. `test/signal-shutdown.test.ts` [EXPAND/NEW]
- Test idempotent unsubscribe: calling unsubscribe twice does not throw.
- Test double-signal: simultaneous `SIGINT` and `SIGTERM` triggers `handle.close()` exactly once.

---

### Work Package 5: Public Acceptance Verification & Tracker Closure

Execute the public acceptance scenarios and ensure clean passes:

```bash
# 1. Type check and lint
npx tsc --noEmit -p tsconfig.test.json
npx eslint "src/**/*.ts" --max-warnings 0

# 2. Emitted JavaScript unit test suite
tsc -p tsconfig.test.json --noEmit false --outDir .m8-test-build && node --test ".m8-test-build/test/**/*.test.js"

# 3. Public M8 exit gates
./snap/verify --lang ts --filter 12-http-server
./snap/verify --lang ts --filter 13-http-client
./snap/verify --lang ts --filter 26-portability-and-failure-safety
./snap/verify --lang ts --filter 28-terminal-presentation

# 4. Regression gates (M6 merge/diff + M7 grammar/presentation)
./snap/verify --lang ts --filter 07-revert
./snap/verify --lang ts --filter 09-merge-text
./snap/verify --lang ts --filter 10-merge-conflicts
./snap/verify --lang ts --filter 11-namespace-conflicts
./snap/verify --lang ts --filter 14-cli-errors
./snap/verify --lang ts --filter 16-dot-collision
./snap/verify --lang ts --filter 17-concurrent-creates
./snap/verify --lang ts --filter 18-three-way-convergence
./snap/verify --lang ts --filter 21-version-algebra
./snap/verify --lang ts --filter 22-ot-matrix
./snap/verify --lang ts --filter 24-cli-grammar-matrix
```

#### Update Ledger
Once all exit gates pass:
1. Update [snap/modules.md](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/modules.md):
   - Mark Module 8 as `Complete` (or record host-specific blockers if any).
   - Document verification evidence and handoff to Module 9.
2. Update [snap/module_plans/module8PROGRESS.md](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/module_plans/module8PROGRESS.md) to record final implementation notes.

---

## Architectural Checklist & Gotchas

| Item | Requirement | Reference |
| :--- | :--- | :--- |
| **Validation First** | Replay validation must complete before socket listen or URL publication. Malformed repo prints no URL. | SPEC §7.9, scenario 12 |
| **Immediate Flush** | The plain startup URL must be flushed to stdout immediately before waiting for signals. | Scenario 12, 28 |
| **Plain Startup URL** | Startup URL is always plain text (`http://127.0.0.1:<port>/repository.json\n`), even with `SNAP_COLOR=always`. | SPEC §7.11, scenario 28 |
| **Zero-Byte HEAD** | HEAD returns representation headers and exactly zero body bytes. | SPEC §9, scenario 12 |
| **Exact Path Routing** | Raw origin-form path `/repository.json` only. Any query (e.g. `?x=1`) is 404. Disallowed methods are 405. | SPEC §9, scenario 12 |
| **Snapshot Immutability**| Commits made on disk after serve startup do NOT alter the served bytes. | SPEC §9, scenario 12 |
| **No Redirects** | HTTP client never follows 3xx redirects. HTTP 302 fails with error message containing `HTTP 302`. | SPEC §9, scenario 13 |
| **Zero Mutation on Error**| Non-200, invalid JSON, or schema errors on remote repository leave local tree and repo untouched. | SPEC §10, scenario 26 |
| **Clean Signal Exit** | SIGINT and SIGTERM close server, clean listeners, and exit 0 with empty stderr. | SPEC §7.9, scenario 12 |
| **Zero External Deps** | Production code must only use Node built-ins (`node:http`, `node:https`, `node:url`). | `decisions.md` |
