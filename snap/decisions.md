# Decisions

Append brief descriptions of major architectural, product, or behavioral
decisions below.

- Use strict TypeScript compilation and type-aware ESLint strict/stylistic rules, with all warnings treated as failures.
- Zero production runtime dependencies: use Node.js built-ins only, keeping the toolchain lightweight, portable, and deterministic.
- Functional-core, imperative-shell architecture: the domain engine is pure with zero imports from `node:*`, ports, or external packages; all side effects are isolated behind explicit I/O ports and Node adapters.
- Strict validation boundary for untrusted data: untrusted bytes pass through fatal UTF-8 decoding and a custom strict JSON parser (`parseJsonStrict`) with decoded duplicate-key detection before domain schemas or values are created.
- Nominal branded types with validating constructors (`Version`, `ContributorId`, `TrackedPath`) to make domain invariants unforgeable.
- Centralized unsigned UTF-8 byte ordering (`compareUnsignedUtf8`) across all domain sorting, path comparisons, and tie-breaking.
- Four-way causal version comparison (`equal`, `before`, `after`, `concurrent`) and vector clock joins using Snap total ordering (`SNAP_ORDER`), treating missing contributor components as revision 0.
- Prepare/apply mutation model with atomic metadata publication: compute and validate full transitions before writing, update working-tree files first, and publish `repository.json` atomically via same-directory temp file sync (`fsync`) and rename.
- Configuration precedence and document replacement: local `.snap/config.json` strictly shadows global `$HOME/.snapconfig.json`, invalid local configuration immediately fails and blocks fallback, and `snap config` replaces the entire document with the canonical schema.
- Identity resolution isolation: contributor identity resolution is decoupled from repository discovery and invoked exclusively by patch-authoring commands (`commit`, `revert`).
- Canonical minimum-edit diff with delete-on-tie recurrence: diffing strictly implements SPEC §5 dynamic programming with a delete-on-tie walk (`D(i+1, j) <= D(i, j+1)`), shared across commit, diff, revert, validation, and OT.
- Byte preservation and LF-retaining tokenization: classify text strictly as valid UTF-8 without NUL bytes; tokenize immediately after LF while preserving token-internal CRLF; encode binary payloads via strict, canonical RFC 4648 padded base64.
- Working tree scanning: exclude only the root `.snap/` directory (nested `.snap` directories are tracked content), ignore empty directories, reject non-regular entries (symlinks, FIFOs, sockets, devices) without following them, and differentiate lightweight status deltas from full change-selection.
- Decoupled semantic CLI results and error channels: commands return typed result records rendered separately in plain or ANSI modes; expected domain/usage errors exit with code 1 and emit a sanitized single-line message to stderr, while unexpected defects exit with code 2.
- Single full-history boundary and replay engine: only `ValidatedRepository` crosses repository-loading boundaries; exact bases and arbitrary known versions materialize through one dynamically recomputed ready-set scheduler, while patch integration observes immutable `B`/`C` snapshots, resolves namespace collisions first, and transforms text once through the aggregate canonical context diff.
