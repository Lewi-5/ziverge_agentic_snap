# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Implementation plan

Before starting or reviewing Snap implementation work, read
[`snap/PLAN.md`](snap/PLAN.md). Follow its architecture boundaries, milestone
dependencies, agent ownership model, and verification gates. The specification
and public acceptance suite remain authoritative if the plan conflicts with either.

## Module tracking

Use [`snap/modules.md`](snap/modules.md) as the only progress tracker. Before
starting work, review it and record the active module's status, owner, and immediate
objective. At handoff or completion, record the latest verification and a concise
handoff note, following the completion rules in the implementation plan.

## Repository layout

This repo currently contains one capstone project, `snap/` (a small local
version control system). All substantive work happens under `snap/`;
implementation code lives in a per-language directory at the project root
(e.g. `snap/ts/`), one of which is selected for active development.

## Sources of truth

- [`snap/SPEC.md`](snap/SPEC.md) is the canonical behavioral contract for Snap.
  All three target implementations (TypeScript, Rust, Scala) must match it
  exactly.
- [`snap/tests/`](snap/tests) is the language-neutral YAML acceptance suite —
  the authoritative definition of "correct" public behavior. Language-specific
  unit tests may exist during development but never replace this suite.
- [`snap/TEST-HARNESS.md`](snap/TEST-HARNESS.md) documents the YAML test format
  and the harness (`snap/test-harness/`) that executes it.

When implementation work reveals an ambiguity or contradiction in the spec,
fix `SPEC.md` (or note the fix in the same commit) and add a regression case to
the YAML suite — never let the implementation silently become authoritative.

## Commands

Run from the repository root:

```bash
# Run a Snap command against the bundled/most-recently-modified implementation
./snap/run init /tmp/example
./snap/run --lang ts --version   # pick an implementation explicitly (ts|rust|scala)

# Run the full public acceptance suite
./snap/verify --lang ts
./snap/verify --candidate /path/to/any/snap/executable

# Verify options (delegates to run_tests -> test-harness/ CLI)
./snap/verify --filter <substring>   # run a subset of tests by filename/name
./snap/verify --list                 # validate & list tests without running
./snap/verify --verbose              # print step stdout/stderr
./snap/verify --keep-failed          # preserve failed sandboxes for inspection
```

For TypeScript, `verify` installs locked dependencies and runs the candidate
through `tsx`; run `npm run build` in `snap/ts/` separately for a static
type-check. For Rust/Scala, `verify` builds the workspace first.

To modify or test the harness itself:

```bash
cd snap/test-harness
npm run check
npm test
```

There is no single-test flag on `verify`; use `--filter` with a substring of
the YAML filename or `name:` field (e.g. `./snap/verify --lang ts --filter merge`).

## Committing work

Commit to git after finishing each major chunk of work — a completed command,
a completed layer (e.g. version algebra, replay/OT, filesystem
materialization, CLI dispatch), or a fix plus its regression test — not after
every small edit. Run the relevant verification (`./snap/verify --lang ts` or
the harness's `npm run check && npm test`) first and commit only once it
passes. Prefer several focused commits over one large one at the end of a
session.

## Architecture (Snap itself)

Snap is **not** snapshot-based version control — internalize this before
touching implementation code:

- A **version** is a vector clock (contributor ID -> revision count), not a
  commit hash or branch pointer. See SPEC §3 for canonical syntax, causal
  comparison (`<`, `>`, `=`, `||`), and the "Snap order" total order used only
  to sequence concurrent patches deterministically.
- A **repository** is a causally-closed set of **patches**, each owned by
  exactly one `(contributor, revision)` "dot." `merge` unions patch sets and
  joins frontiers — it authors no patch and creates no merge commit.
- **Replay** (SPEC §6) deterministically rebuilds a tree from patches using a
  specific integration order, a table-driven operational transform for
  concurrent text edits (§6.3), and fixed path-level winner rules for
  non-text/namespace conflicts (§6.4). This is the algorithmic core and where
  most bugs will live.
- **Text diff** (SPEC §5) is one specific DP recurrence with a deletion-wins
  tie-break — required to be byte-identical across implementations, including
  for repeated-line edge cases.
- Two output presentations exist for every command: byte-stable **plain mode**
  (used for scripts/tests) and ANSI **terminal mode** (`SNAP_COLOR`/`NO_COLOR`
  controlled) — presentation must never affect execution, warnings, or exit
  codes (§7.11).
- Scope is deliberately narrow: no branches, staging, checkout, rebase,
  cherry-pick, conflict markers, auth, or object storage (§12). Don't add any
  of these; spend implementation effort on exact semantics instead.

Within a language implementation, keep these concerns separated (per
[`snap/AGENTS.md`](snap/AGENTS.md)): versions, text diff/OT, repository
validation and replay, filesystem materialization, working-tree diffing, HTTP
serving, command logic, and CLI argument dispatch.

## Test harness architecture

`snap/test-harness/` (TypeScript, `src/`) is a generic process-driving harness,
independent of any Snap implementation:

- `yaml-loader.ts` validates YAML test files (discriminated unions, strict
  schema) into typed values.
- `interpolate.ts` handles `{{name}}` variable substitution (sandbox path,
  candidate path, captured output from earlier steps).
- `filesystem.ts` provides sandbox-confined file operations (write, copy,
  symlink, fifo) used by test setup and assertions.
- `process.ts` runs the candidate binary as a subprocess (one-shot `run` or
  long-lived `start`/`stop`), capturing stdout/stderr/exit code.
- `http-server.ts` spins up controllable inline-response HTTP servers for
  testing Snap's HTTP client, and issues raw HTTP requests against a running
  `snap --serve`.
- `assertions.ts` implements exact filesystem/JSON/process/HTTP assertions.
- `runner.ts` executes one YAML case end-to-end in an isolated temp sandbox;
  `reporter.ts` and `cli.ts` handle output and the `verify`/`run_tests` entry
  point.

The harness never imports Snap implementation code — it only drives compiled/
executable candidates and inspects filesystem/process/HTTP behavior, so it
stays language-neutral across the TS/Rust/Scala editions.
