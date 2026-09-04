# Snap Architectural & Behavioral Decisions

This document records the major architectural, product, and behavioral decisions made throughout the design and implementation of Snap, organized by core principles and chronological milestone history (M1–M9).

---

## Core Architectural & Cross-Cutting Principles

- **Zero production runtime dependencies**: The production engine and CLI rely exclusively on Node.js built-ins (`node:fs`, `node:path`, `node:http`, `node:crypto`, `node:events`). This ensures portability, eliminates supply-chain vulnerabilities, and guarantees deterministic runtime behavior across platforms.
- **Strict TypeScript & static type safety**: Strict compilation (`noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`) paired with type-aware ESLint rules; all warnings are treated as fatal build failures.
- **Functional-core, imperative-shell architecture**: The domain layer (`domain/`) is completely pure with zero imports from `node:*`, external packages, or I/O ports. All side effects (disk, environment, network, terminal) are strictly isolated behind explicit port interfaces (`ports/`) and implemented by Node adapters (`adapters/`).
- **Nominal branded types with validating constructors**: Critical domain primitives (`Version`, `ContributorId`, `TrackedPath`) use branded types that can only be instantiated through validating factory functions, making illegal states and unvalidated strings unrepresentable in application logic.
- **Centralized unsigned UTF-8 byte ordering (`compareUnsignedUtf8`)**: Exactly one implementation of unsigned UTF-8 byte comparison is shared across all version ordering, file path sorting, change-list sorting, status row ordering, and conflict tie-breaking.
- **Strict validation boundary for untrusted data**: Raw bytes from the filesystem or network must pass through fatal UTF-8 decoding and strict JSON parsing with duplicate-key detection before domain entities or schemas are constructed.
- **Prepare/apply mutation model**: All preconditions, validations, target trees, and metadata documents are fully resolved and verified in memory before initiating any side-effecting disk writes.

---

## Chronological Milestone History

### Module 1: Foundations, Clock Algebra, CLI Shell, and Init
*Authoritative plans: `module1PLAN.md`, `module1planCORRECTIONS.md`, `module1REVIEW.md`*

- **Repository discovery by `repository.json`**: A directory is recognized as a Snap repository root if and only if it contains `.snap/repository.json`. The presence of an empty or bare `.snap/` directory without `repository.json` is not sufficient.
- **Non-following ancestor discovery**: Discovery walks upward from the operand or working directory through ancestors to the filesystem root without traversing symlinks.
- **Nested and duplicate initialization rejection**: `snap init` checks discovery before any write. If the target path is already a repository root, it fails with `repository already exists`. If the target is inside an existing repository ancestor, it fails with `cannot initialize inside repository`.
- **Four-way causal version comparison & join**: Version vectors support exact four-way comparisons (`equal`, `before`, `after`, `concurrent`). Joining vectors computes the componentwise maximum of counters, treating missing contributor components as counter 0.
- **Deterministic Snap total order (`SNAP_ORDER`)**: Deterministic tie-breaking for concurrent versions orders by the sorted union of contributor IDs, comparing counters until the first unequal component.
- **Canonical repository JSON emission**: Writers emit two-space indented JSON terminated by a single LF (`\n`), matching SPEC §4.1 recommendation.
- **Strict CLI dispatch & exit-code contract**:
  - Success exits with code `0`.
  - Expected domain or usage errors exit with code `1` with a single-line message to stderr.
  - Unexpected internal exceptions exit with code `2`.
  - `--version` succeeds only when the argument vector is exactly `['--version']`, short-circuiting repository discovery.
- **Decoupled semantic presentation boundary**: Application use cases return typed domain results or expected errors. CLI commands return semantic output records rendered by a dedicated presentation seam; `main.ts` alone handles stream I/O and process exit codes.

### Module 2: Configuration and Identity
*Authoritative plans: `module2PLAN.md`*

- **Fatal UTF-8 decoding (`decodeUtf8`)**: Configuration and repository files are read as raw bytes and decoded using a fatal UTF-8 decoder (`fatal: true`), rejecting malformed byte sequences immediately.
- **Custom strict JSON parser (`parseJsonStrict`)**: Built-in `JSON.parse` is superseded by a hand-rolled strict parser that detects duplicate keys at any depth, comparing decoded Unicode escape sequences (e.g., `"id"` and `"\u0069d"` collide).
- **Prototype pollution prevention**: Strict JSON object parsing preserves `__proto__` as an enumerable own data property without mutating `Object.prototype`. Schema validation strictly inspects own properties.
- **Exact configuration schema**: Validates the exact structure `{"contributor":{"id":"<id>"}}`. Missing fields, non-string IDs, or unrecognized top-level/nested keys are rejected.
- **Contributor ID grammar**: Enforces ASCII email-like syntax `[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+` with a maximum length of 254 bytes.
- **Strict configuration precedence**: Local `.snap/config.json` strictly shadows global `$HOME/.snapconfig.json`. A corrupt or invalid local configuration file immediately raises an error and strictly blocks fallback to global configuration.
- **Document replacement**: `snap config` completely replaces the target configuration file with the canonical two-space indented JSON document, discarding prior malformed content or unrecognized keys.
- **Identity resolution isolation**: Contributor identity resolution is decoupled from repository discovery and invoked exclusively by patch-authoring commands (`commit`, `revert`). Read-only commands (`status`, `log`, `diff`) never check or require contributor identity.
- **Silent success for `snap config`**: Successful configuration updates emit zero bytes to stdout and stderr in both plain and terminal modes.

### Module 3: Working Tree and Linear History
*Authoritative plans: `module3PLAN.md`, `module3planCORRECTIONS.md`, `module3PROGRESS.md`*

- **Working tree scanning boundary**: Scans recursively from the repository root, excluding only the top-level `.snap/` directory (nested `.snap` directories inside tracked folders are treated as tracked content).
- **Empty directories ignored**: Empty directories are not tracked and do not produce dirty tree status rows or change entries.
- **Rejection of unsupported filesystem entries**: Symlinks, FIFOs, sockets, and device nodes encountered during scanning are rejected immediately on `lstat` without following them.
- **Prefix-free tracked path invariant**: Rejects path collisions where a path is both a file and a parent directory prefix of another path (e.g., `a` and `a/b`). Paths must use normalized forward slashes, cannot contain empty, `.`, or `..` segments, and cannot contain backslashes.
- **Unsigned UTF-8 path sorting**: Status rows (`A`, `M`, `D`), file tree entries, and diff listings sort strictly by the unsigned UTF-8 bytes of the path, independent of the change operation or filesystem readdir ordering.
- **Staged linear validation boundary**: M3 introduces staged validation for linear histories written by Snap itself, cleanly separated from the full causal DAG validation introduced in M5.
- **Atomic metadata publication**: Working-tree file updates are applied first. New repository metadata is written to a temporary file in the same directory (`.snap/repository.json.tmp.<id>`), flushed to disk via `fsync`, and atomically renamed to `repository.json`.

### Module 4: Canonical Diff and Content Algebra
*Authoritative plans: `module4PLAN.md`*

- **Strict text vs. binary classification**: Content is classified strictly as text if it consists of valid UTF-8 bytes and contains zero NUL bytes (`0x00`). The presence of any NUL byte or an invalid UTF-8 sequence causes the file to be treated as binary.
- **LF-retaining tokenization**: Files are tokenized immediately after each LF (`\n`). CRLF line endings within tokens and files lacking a trailing newline are preserved exactly without newline normalization or replacement.
- **Canonical minimum-edit diff with delete-on-tie recurrence**: Implements SPEC §5 dynamic programming with a strict delete-on-tie recurrence (`D(i+1, j) <= D(i, j+1)`), guaranteeing deterministic and canonical edit scripts across all implementations.
- **Single edit coalescer**: Validated edit scripts cannot contain adjacent operations of the same kind (`retain`, `delete`, `insert`). Edits are coalesced through a single shared implementation used across diffing, validation, and OT.
- **Canonical base64 encoding**: Binary file contents in `put` changes are encoded and decoded using strict RFC 4648 padded base64.
- **Semantic diff records**: Diffing produces structured semantic records representing text unified diffs, binary changes, absent-side states, and missing-newline indicators, allowing independent plain and terminal rendering.

### Module 5: Full Validation, Deterministic Replay, and Operational Transform
*Authoritative plans: `module5PLAN.md`, `module5PROGRESS.md`*

- **Single `ValidatedRepository` boundary**: Replaces M3's staged linear validator. All commands loading a repository must validate the complete causal history, constructing an opaque `ValidatedRepository` before executing observation or mutation.
- **Causal DAG and history validation**:
  - Validates format version 1, vector clock frontier, and patch array topology.
  - Ensures unique patch dots and contiguous per-author revision counters (`1, 2, ...`).
  - Verifies base closure (every patch's base version exists in history) and frontier reachability.
  - Detects and rejects causal cycles and disconnected components.
- **Deterministic ready-set topological scheduler**: Materializes arbitrary historical versions from the empty tree. When multiple patches become ready concurrently, ties are broken deterministically by comparing revision numbers, then author IDs via Snap total order.
- **Exact-base semantic validation**: Every patch and change in the repository must apply cleanly against the exact replayed tree of its declared causal base.
- **Aggregate-context text Operational Transformation (OT)**: Implements the 6-row transformation matrix defined in SPEC §6.3 against aggregate context edits, handling cursor splitting, count adjustments, and insert tie-breaking.
- **Patch-wide namespace conflict resolution**: Resolves parent-directory vs. file prefix collisions across the entire patch before evaluating path-level rules.
- **Deterministic path conflict winner rules (Priority 1–6)**: Whole-file and concurrent path conflicts evaluate strictly in the following priority order (SPEC §6.4):
  1. Identical target content: keep current, emit no warning.
  2. Incoming delete wins (`delete-wins`).
  3. Earlier concurrent delete wins (`delete-wins`).
  4. Incoming create wins (`later-create-wins`).
  5. Incoming `put` wins (`later-put-wins`).
  6. Incoming text against current binary: binary wins (`put-wins`).
- **Warning facts set ordering**: Emitted merge warnings are sorted by tracked path (unsigned UTF-8) and then by reason, with duplicates eliminated.

### Module 6: Merge, Revert, and Safe Materialization
*Authoritative plans: `module6PLAN.md`, `module6PROGRESS.md`*

- **Source-neutral repository loading**: Repository operands (local directory path or remote URL) are loaded and validated through a unified source contract before any comparison.
- **Typed patch dot collision detection**: Cross-repository operations compare common version dots by parsed structural patch content. If two repositories share a dot with different patch contents, it is treated as data corruption (exit code 1 error, zero mutation), not a merge conflict.
- **Patch set union & frontier join**: Merge computes the mathematical set union of patches and componentwise join of frontiers.
- **Net-new warning calculation**: Only warnings newly introduced by the merge are emitted (`joined_warnings \ pre_merge_warnings`). Existing historical warnings are not re-reported.
- **Clean-tree requirement for merge**: Merge requires a clean working tree matching the current frontier; dirty trees are rejected before any disk mutation.
- **Authorless merge**: Merges do not author merge commits or require contributor identity; they integrate existing historical patches and advance the frontier.
- **Additive, non-destructive revert**: Reverting to an arbitrary historical version authors a new forward patch whose parent is the current frontier and whose content transitions the current tree to the historical target tree.
- **Revert commit message length exception**: Standard commit messages are limited to 4096 UTF-8 bytes, but auto-generated `revert to <version>` messages are explicitly exempt to accommodate large frontiers with many contributors.
- **Pure `TreeMutationPlan` & safe materialization**: Computes the exact file additions, modifications, deletions, and empty-directory prunings before touching disk. Working tree changes are applied first; if any filesystem write fails, repository metadata remains completely untouched.

### Module 7: CLI Hardening and Presentation
*Authoritative plans: `module7PLAN.md`, `module7PROGRESS.md`, `module7REMAINING.md`*

- **Strict upfront CLI grammar parsing**: Command arguments are fully parsed and validated before application use cases are invoked. Invalid arguments or option placements fail immediately with exit code 2.
- **Decoupled execution and presentation**: Application commands yield structured semantic results (`CommandResult`). Dedicated renderers (`render-plain.ts`, `render-terminal.ts`) format results into output streams.
- **Stream-independent color selection**: `stdout` and `stderr` independently evaluate TTY capability and environment variables (`SNAP_COLOR=always|never|auto`, `NO_COLOR=1`).
- **Exact ANSI styling**: Terminal mode renders byte-exact ANSI SGR escape sequences for status rows (`A` green, `M` yellow, `D` red), diff hunks, log versions, warning symbols, and error badges.
- **Uncolored `--serve` startup URL**: The startup URL emitted by `snap --serve [port]` is strictly uncolored plain text across all modes, ensuring piped scripts can parse the URL cleanly.
- **Whitespace preservation**: Filenames, paths, and commit messages preserve leading, trailing, and internal whitespace without stripping.
- **Single release version**: Public release version is defined once in `package.json` (`1.0.0`) and surfaced identically across CLI version queries.

### Module 8: Embedded HTTP and Remote Repositories
*Authoritative plans: `module8PLAN.md`, `module8PROGRESS.md`, `module8REMAINING.md`*

- **Read-only loopback server**: `snap --serve [port]` binds strictly to `127.0.0.1` (default port 8765, or explicit/ephemeral port 0).
- **Immutable startup snapshot**: The repository is validated once at server startup, capturing an immutable serialized JSON snapshot. Subsequent local commits do not alter the data served by the running instance.
- **Strict HTTP resource routing**:
  - `GET /repository.json`: returns HTTP 200 with JSON content type and snapshot bytes.
  - `HEAD /repository.json`: returns HTTP 200 with headers and an exact zero-byte body.
  - Other paths return HTTP 404.
  - Other HTTP methods return HTTP 405 with `Allow: GET, HEAD`.
- **Graceful POSIX signal shutdown**: The server listens for `SIGINT` and `SIGTERM`, closing all active sockets cleanly and exiting with code 0.
- **Single-request HTTP client**: Remote repository operands (`http://`, `https://`) are loaded with a single GET request. Redirects are disabled (non-200 responses fail with an expected error).
- **Zero local mutation on remote failure**: If a remote repository fails validation, returns non-200, or contains dot collisions, the command fails with exit code 1 without mutating the local working tree or `.snap/` directory.

### Module 9 & Final Audit: Full Regression and Failure Safety
*Authoritative plans: `module9PLAN.md`, `module9REMAINING.md`, `FINALTESTS.md`*

- **Enforced one-way architectural layering**: A static test suite (`test/architecture-boundaries.test.ts`) verifies that domain modules import no outer layers, ports do not import applications, and production code imports only Node built-ins.
- **Mutation failure injection**: Verified that failures during tree materialization (disk full, permission denied) leave `repository.json` byte-for-byte intact, allowing clean recovery without repository corruption.
- **Algebraic property verification**: Verified set-union properties of patch integration (idempotence, commutativity, and associativity) across 24 seeded permutations of multi-repository histories.
- **Cross-platform byte-exact portability**: Verified that CRLF preservation, NUL binary classification, UTF-8 normalization resistance, and RFC 4648 base64 encoding behave identically across platforms and transport media.
