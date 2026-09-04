# M8: Embedded HTTP and Remote Repositories

## Context

`snap/PLAN.md` assigns M8 the read-only network boundary. It depends on M5
through M7: strict repository validation/replay, merge/revert/source abstractions,
and final grammar/presentation must already be stable. Read their handoffs and
confirm M6's merge and cross-repository diff accept a source-neutral validated
repository rather than parsing local files inline.

We are building **M8: Embedded HTTP and Remote Repositories**. M8 implements the
long-running `snap --serve [port]` command, its immutable startup snapshot and
fixed GET/HEAD resource, and an exact one-request HTTP/HTTPS repository loader
used by merge and observational diff. It completes scenario 28 by integrating
the server lifecycle with M7's always-plain startup URL.

HTTP remains deliberately small. There is no writable endpoint, redirect,
authentication, caching, discovery, retry, or background refresh. Remote bytes
cross the same fatal UTF-8, duplicate-aware JSON, exact schema, and full
repository validator as local bytes.

Behavioral authority: `snap/SPEC.md` §§7.6, 7.8–7.11, 9, and 10. Public exit
gate: scenarios 12, 13, 26, and 28.

## Scope

### In scope

- Validate the current repository once at server startup and capture one
  immutable serialized repository snapshot.
- Bind only `127.0.0.1`; support default 8765, explicit ports, and ephemeral 0.
- Publish and flush the actual plain startup URL before waiting.
- Serve exact `GET /repository.json` and `HEAD /repository.json`; return 404 for
  other request targets and 405 plus `Allow: GET, HEAD` for other methods on the
  resource.
- Preserve an exact zero-byte HEAD body and correct JSON content type.
- Close cleanly on SIGINT and SIGTERM and exit 0.
- Load `http://` and `https://` repository operands with one GET to the exact
  supplied URL, redirects disabled, and status 200 required. Stream with normal
  backpressure, but do not add an undocumented repository-size validity limit;
  `SPEC.md` defines no maximum repository body size.
- Feed remote response bytes into the shared full validator and source-neutral
  merge/diff use cases.
- Prove malformed/non-200/colliding remotes produce no local mutation.
- Complete M7 terminal integration while keeping the startup URL plain.

### Out of scope

- Authentication, authorization, redirects, retries, proxies as product logic,
  caching, conditional requests, writable endpoints, TLS trust configuration,
  remote discovery, and concurrent server snapshot updates.
- General web server framework dependencies; production uses Node built-ins.
- Internet services—the acceptance suite uses loopback only.

## File layout (`snap/ts/src/`)

```text
application/
  repository/
    source.ts                         [MOD] local + HTTP repository source union
    load-repository-source.ts         [MOD] dispatch by exact URL prefix
  commands/
    serve.ts                          [NEW] validate/snapshot/start lifecycle
    merge.ts                          [MOD] accept remote source
    diff.ts                           [MOD] accept remote source
ports/
  http-client-port.ts                 [NEW] one-request byte response contract
  http-server-port.ts                 [NEW] loopback server/handle contract
  signal-port.ts                      [NEW] SIGINT/SIGTERM subscription lifecycle
  output-port.ts                      [NEW if needed] awaited startup write/flush
adapters/
  node-http-client-adapter.ts         [NEW] built-in http/https, no redirects
  node-http-server-adapter.ts         [NEW] exact routing and immutable bytes
  node-signal-adapter.ts              [NEW] scoped listener registration/cleanup
cli/
  commands/serve.ts                   [NEW] typed serve request/result lifecycle
  results.ts                          [MOD] plain startup URL semantic record
  dispatch.ts                         [MOD]
main.ts                               [MOD] start, publish readiness, await close
test/
  node-http-client-adapter.test.ts
  node-http-server-adapter.test.ts
  serve-command.test.ts
  remote-merge-diff.test.ts
  signal-shutdown.test.ts
  server-presentation.test.ts
```

If the existing CLI execution type handles only immediate commands, extend it
with an explicit long-running serve execution/handle. Do not make the domain
renderer own sockets or signals, and do not let the server adapter parse
repositories.

## Layering and lifecycle rules

- Node HTTP adapters own sockets/protocol effects. The application layer owns
  when repository validation occurs and what immutable bytes are served.
- The HTTP client returns status, headers as needed, and body bytes. It does not
  decode JSON or construct repository values.
- Local and remote source loaders converge immediately after byte acquisition:
  fatal UTF-8 -> duplicate-aware JSON -> schema -> full semantic validation.
- Merge/diff remain unaware of transport once they receive the validated
  operand repository.
- Signal listeners are registered for one server lifecycle and always removed
  on shutdown/error so tests and repeated in-process invocations do not leak.
- Main/its output adapter writes and awaits the startup URL before awaiting the
  server's closed promise. The URL is a semantic plain-only record.

## Key behaviors

### 1. Server startup preparation

For `snap --serve [port]`, first discover/load and fully validate the nearest
local repository. Replay validation must finish before binding a socket or
printing. Canonically serialize the validated startup repository once with
two-space indentation and one trailing LF; retain immutable bytes for the
server lifetime.

Ask the server adapter to bind host `127.0.0.1` and the parsed M7 port (default
8765, 0 allowed). After listening, read the actual assigned port and emit:

```text
http://127.0.0.1:<actual-port>/repository.json
```

This record is plain even under `SNAP_COLOR=always`. Await completion of the
stdout write before entering the long wait so parent processes can use the URL
as a readiness signal. Startup/validation/bind failure prints no URL.

### 2. Immutable fixed resource

Match the raw origin-form request target exactly. Only `/repository.json`
matches; a query such as `/repository.json?x=1` returns 404. For the exact
resource:

- GET -> 200, `Content-Type: application/json; charset=utf-8`, snapshot bytes.
- HEAD -> the same status and representation headers, but exactly zero body
  bytes. `Content-Length`, if emitted, describes the GET representation.
- Any other method -> 405, `Allow: GET, HEAD`, with no requirement to expose
  another resource.

Other targets return 404. Resolve path matching before method matching so an
unsupported method to a nonexistent target remains a nonexistent path. Avoid
framework-generated HTML bodies or redirects; response bodies for error status
may be empty.

Do not reread `repository.json`. Commits made after startup do not alter the
served frontier, patches, serialization, or bytes.

### 3. Signals and shutdown

Register SIGINT and SIGTERM after the server is listening. Either signal closes
the listening server, stops accepting requests, waits for close completion,
removes both listeners, and exits 0 with no stderr. Make shutdown idempotent so
duplicate/near-simultaneous signals cannot double-close or change the exit.

Unexpected listen/request/server errors flow to the centralized unexpected
failure path (exit 2) after cleanup. A normal test-harness stop sees exactly the
one startup URL on stdout.

### 4. Repository source classification

An operand beginning exactly with `http://` or `https://` is remote. Every other
operand is the M6 local repository-root path resolved against process cwd. Do
not reinterpret malformed near-URL strings as supported schemes and do not
perform URL discovery.

Parse a recognized URL strictly enough for Node's built-in client, preserving
its supplied path and query as the request target. Userinfo/authentication is
out of scope and should not gain special credential behavior.

### 5. Exact one-GET client

For each remote merge or cross-repository diff invocation:

1. Issue one GET to the exact URL.
2. Disable automatic redirects; Node's base clients already expose 3xx, so do
   not follow `Location`.
3. Require status 200. A status such as 302 fails with a detail containing
   `HTTP 302`.
4. Read the complete response bytes without text decoding or content
   normalization. Use normal stream backpressure; resource exhaustion remains an
   unexpected runtime failure rather than a new expected "repository too large"
   rule.
5. Pass bytes to the same repository decoder/validator used locally.

No retry is performed for status, transport, malformed JSON, or validation
failure. Each distinct command performs its own one request; there is no
cross-process cache.

### 6. Remote merge and diff safety

Remote merge otherwise runs M6 unchanged: typed common-dot comparison, union,
join, replay, clean-tree check, complete preparation, working-tree update, then
metadata publication. Remote diff remains observational and compares all common
dots before rendering.

Malformed JSON, duplicate keys, unknown fields, invalid histories, non-200
responses, and transport errors yield no local files,
metadata changes, or partial diff output. Collision checks remain based on
parsed typed patches rather than JSON key order or whitespace.

## Exact outputs and protocol matrix

| Case | Observable result |
| --- | --- |
| serve startup | one plain `http://127.0.0.1:<port>/repository.json\n` |
| GET exact resource | 200 + JSON content type + startup snapshot bytes |
| HEAD exact resource | same status/headers, zero body bytes |
| POST exact resource | 405 + `Allow: GET, HEAD` |
| GET resource with query | 404 |
| SIGINT/SIGTERM | clean close, exit 0, no additional output |
| invalid startup repository | expected error, no URL/socket lifecycle |
| remote HTTP 302 | expected error containing `HTTP 302`, no redirect |
| malformed remote | shared validation error, no local mutation/output |

Remote merge/diff success retains M6's exact plain or M7 terminal output. Only
the server URL bypasses terminal styling.

## Tests to write

### Server adapter and use case

- Default, explicit available, and port 0 binding; host is exactly loopback and
  reported port is actual.
- GET/HEAD bytes and headers; raw HEAD inspection proves zero body; POST/other
  methods and exact-path/query behavior.
- Canonical startup bytes remain unchanged after on-disk repository mutation.
- Invalid repository and bind failure emit no readiness URL.
- SIGINT and SIGTERM close cleanly; listener cleanup and idempotent shutdown.
- `SNAP_COLOR=always` still emits a plain URL.

### HTTP client

- Exact method/target including query, exactly one request, 200 body bytes,
  http and language-specific https coverage where trust setup is available.
- 3xx with `Location` is not followed; representative 4xx/5xx, missing status,
  transport reset, and response interruption.
- Invalid UTF-8, duplicate JSON keys, malformed JSON, schema errors, and invalid
  causal history all pass through shared expected validation errors.

### Remote command integration

- Remote diff is observational; remote merge materializes byte-exact CRLF,
  Unicode, NUL/binary, and empty files.
- Both commands check typed common-dot collisions and fully validate both
  repositories.
- All remote failures preserve local repository JSON/tree; controlled server
  logs show one GET per command and no redirect target request.
- Local repository operands continue to work through the same application
  source abstraction.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M5–M7 complete; review M6's source abstraction; set M8
     `In Progress` with owner/objective.
1. **HTTP client boundary**
   - Add the one-request port/Node adapter, bounds, status/redirect behavior,
     and shared remote decoding tests.
2. **Remote source integration**
   - Extend M6 merge/diff source dispatch without changing their domain logic;
     prove no-mutation failures.
3. **HTTP server boundary**
   - Add immutable snapshot routing, exact GET/HEAD/error responses, and
     loopback/port behavior.
4. **Serve lifecycle**
   - Add validated startup, awaited plain URL publication, signal handling,
     cleanup, and long-running CLI execution support.
5. **Terminal and process integration**
   - Close scenario 28 and run complete controlled-server process tests.
6. **Completion and handoff**
   - Record exact verification, streaming/lifecycle behavior, and
     remaining M9 hardening work.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 12-http-server
./snap/verify --lang ts --filter 13-http-client
./snap/verify --lang ts --filter 26-portability-and-failure-safety
./snap/verify --lang ts --filter 28-terminal-presentation
```

Also rerun M6 merge/diff/collision scenarios with local operands and M7 grammar
scenarios. M8 is complete only when exact request logs, immutable snapshot
bytes, signal cleanup, malformed-remote no-mutation behavior, terminal/server
integration, strict checking, and every public gate pass.
