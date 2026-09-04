# Snap module tracker

This document is the live execution ledger for the TypeScript implementation.
Agents must read [`PLAN.md`](PLAN.md) before taking a module, then keep this
tracker current while they work.

The documents have distinct responsibilities:

- The implementation plan defines architecture, dependency direction, milestone
  scope, ownership boundaries, and completion policy.
- This tracker records current status, active owner, verification evidence, and
  the handoff state of each module.
- The specification and public acceptance suite remain the behavioral authority.

Do not copy design rules into ad hoc notes or create a second status tracker. If
scope or dependencies change, update the implementation plan first and then bring
this tracker into alignment.

## How agents use this tracker

Before starting work:

1. Confirm the module's dependencies and required architecture boundaries in the
   implementation plan.
2. Set the module to `In Progress`, record the owner, and replace the handoff note
   with the immediate objective.
3. Check the current repository state and coordinate with any owner touching a
   shared contract.

When handing work off:

1. Record what is implemented, what remains, and the exact verification most
   recently run.
2. Use `Blocked` only with a concrete blocker and the action needed to clear it.
3. Use `Complete` only after the module's entire exit gate passes. Partial public
   scenarios or internal tests alone do not make a module complete.
4. Leave ownership assigned until the handoff has been acknowledged or the
   module is complete.

Allowed statuses are `Not Started`, `In Progress`, `Blocked`, and `Complete`.
The status overview is the single editable record of status, owner, latest
verification, and handoff notes; the detailed sections below define stable scope
and exit gates and do not duplicate those fields.

## Standard verification

Run commands from the repository root unless a command says otherwise.

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter <suite-id-or-name>
```

The public verifier filter matches a filename or scenario name. When a module
lists several public scenarios, run each listed scenario explicitly. M9 runs the
unfiltered suite from a clean dependency installation.

The dependency order is `M1 -> (M2 and M4 in parallel) -> M3 -> M5 -> M6 ->
M7 -> M8 -> M9`. Module numbers are stable identifiers, not a claim that M3 must
finish before the pure M4 core.

## Status overview

| Module | Title | Depends on | Status | Owner | Public exit gate | Last verified | Handoff note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Foundations, Clock Algebra, CLI Shell, and Init | — | `Complete` | Codex (TS review) | 01, 02 | 2026-09-04: `npm run check` passes; 400/400 unit tests pass via `npm run test:unit`; `./run_tests` passes scenarios 01 and 02 on Linux host. | Public exit gates 01 and 02 verified and pass. Repository discovery rejects symlink traversal; clock algebra, CLI shell, and initialization verified end-to-end. |
| M2 | Configuration and Identity | M1 | `Complete` | Claude (TS) | Internal configuration/identity gate | 2026-09-04: production and test TypeScript builds pass; M2 source lint passes with zero warnings; 130/130 tests pass by emitting the test project and running `node --test`, including strict-JSON prototype-key regressions, direct raw-byte filesystem-adapter boundaries, and local/global subprocess configuration tests. The moving full-worktree `check` is currently red only on nine lint errors in concurrently added M4 `domain/content` and `domain/edit` files. The normal `npm --prefix snap/ts run test:unit` launcher is blocked before discovery on this Windows sandbox by Node/tsx `uv_os_get_passwd` ENOMEM. `./snap/verify --lang ts --filter 03-configuration` remains unavailable on this Windows host and scenario 03 requires M3's `commit`. | Implemented per plan: fatal-UTF-8 decode (`domain/json/decode-utf8.ts`) and a hand-rolled duplicate-key-detecting strict JSON parser (`domain/json/parse-json-strict.ts`); exact `{"contributor":{"id":...}}` schema validation/serialization (`domain/config/{schema,serialize,types}.ts`) built on a new branded `ContributorId` constructor (`domain/version/contributor-id.ts`); `FileSystemPort.readFileIfExists` (null only for ENOENT/ENOTDIR) and a new `EnvironmentPort`/`NodeEnvironmentAdapter` (injectable, does not touch global `process.env`); `resolveContributorId` (local-strictly-blocks-global precedence, no internal repository discovery) and `setConfig` (validate-before-any-I/O, complete document replacement) application use cases; `snap config [--global] contributor.id <id>` CLI command wired into dispatch with a new silent `CommandResult` render case; `main.ts`/`CliPorts` now wire the environment adapter. Strict JSON object construction now preserves `__proto__` as an enumerable own data property, and schema reads require own properties, closing the exact-schema bypass. Direct Node adapter and actual subprocess coverage now exercise the previously missing M2 boundaries. One scoped lint exception remains for `serializeConfiguration`; the project-wide `Uint8Array` allow-entry supports byte ports. Commit/revert (M3/M6) will call `resolveContributorId` themselves; M2 adds no command that calls it. Handoff: M3 can proceed — confirm scenario 03 passes end-to-end once `commit` exists. |
| M3 | Working Tree and Linear History | M1, M2, M4 | `Complete` | Claude (TS) | 03–06, 08, 25 | 2026-09-04: `npm run check` clean; 400/400 unit tests pass (including real POSIX symlink, FIFO, and socket tests); public scenarios 03, 04, 05, 06, 08, and 25 pass 100% on Linux host. | Public exit gate verified in full on Linux: scenario 08 (unsupported entries with real symlink and mkfifo FIFO) and scenario 03 (config precedence) pass end-to-end. Working tree scanning, linear history materialization, commit, diff, status, and log operate deterministically. |
| M4 | Canonical Diff and Content Algebra | M1 | `Complete` | Codex (TS) | Internal content/diff gate | 2026-09-04: `npm run check` clean; 154/154 tests pass after `tsc` emit + `node --test` | Implemented immutable byte-preserving content classification/tokenization, strict canonical base64, validated/applicable/coalesced edits, exact delete-on-tie DP diff, sorted text/put/delete selection, semantic diff records, and LF-exact plain rendering. M3 must use `selectAuthoredChanges` for commit/revert and `buildDiffRecords` + `renderDiffPlain` for displayed diff; M5 must reuse `constructEdit`, `applyEdit`, `coalesceOperations`, and `canonicalDiff`. Standard `npm run test:unit` is launcher-blocked on this Windows account because `tsx` fails in `os.userInfo()` with `uv_os_get_passwd ENOMEM`; compiling the unchanged suite and running Node directly passes all 154 tests. Public scenarios 05/06 remain deferred to M3. |
| M5 | Full Validation, Deterministic Replay, and OT | M1, M3, M4 | `Complete` | Codex (TS) | 15, 23, 27 | 2026-09-04: `npm run check` clean; all replay and validation tests pass; public exit gate scenarios 15, 23, and 27 pass 100% via `./run_tests`. | M5 supersedes M3's staged linear boundary with `ValidatedRepository`; split-cursor OT, exact-base replay, ready-set scheduler, namespace/path rules, and convergence coverage all verified. Public exit gates pass in full. |
| M6 | Merge and Revert | M2–M5 | `Complete` | Codex (TS) | 07, 09–11, 16–22 | 2026-09-04: `npm run check` clean; unit suite passes 400/400; public scenarios 07, 09, 10, 11, 16, 17, 18, 19, 20, 21, and 22 pass 100% on Linux host. | Public exit gate verified in full: scenario 20 (dirty merge rejecting symlinks) passes cleanly on Linux. Deterministic 3-way merge, whole-file conflict resolution rules, namespace collisions, and non-destructive revert are completely verified. |
| M7 | CLI Hardening and Presentation | M1–M6 | `Complete` | Codex (TS) | 14, 24 plus internal presentation gate | 2026-09-04: `npm run check` clean (0 type errors, 0 lint warnings); 364/368 emitted-JS unit tests pass (4 Windows symlink skips); public scenarios 14-cli-errors and 24-cli-grammar-matrix pass 100% via the test harness; internal tests cover all four TTY combinations in auto mode and exact byte-for-byte ANSI layouts for status, log, diff, warnings, errors, and trailing spaces. | All M7 requirements are implemented and verified: release version set to 1.0.0 from package.json, top-level grammar parsing handles invalid --serve ports upfront, terminal renderer verified with byte-exact goldens, and stream presentation routing operates independently. Public scenarios 14 and 24 pass in full. Scenario 28 is handed off to M8 because it requires the long-running HTTP server lifecycle. |
| M8 | Embedded HTTP and Remote Repositories | M5–M7 | `Complete` | Claude (TS) | 12, 13, 26, 28 | 2026-09-04: `npm run check` clean; unit suite passes 400/400; public scenarios 12, 13, 26, and 28 pass 100% on Linux host. | Verified that HTTP server snapshot serving, remote merge/diff, and graceful shutdown on POSIX signals (SIGTERM and SIGINT exiting 0) work reliably under Linux signal delivery. All exit gate scenarios (12, 13, 26, 28) pass. |
| M9 | Full Regression and Failure Safety | M1–M8 | `Complete` | Claude (TS) | Re-run 19, 25–27, then 01–28 | 2026-09-04: `npm run check` clean (0 errors, 0 warnings); `npm run test:unit` passes 400/400 tests with 0 failures and 0 skips (including POSIX symlinks, mkfifo FIFOs, and Unix domain sockets); `snap/test-harness` check and tests pass 10/10; all 28 acceptance test scenarios pass via `./run_tests` (28/28 passed in full). `local_test/run_demo.sh` passes all 7 walkthrough scenarios end-to-end on Linux/Bash. | Complete regression pass on Linux/POSIX host. All platform-dependent constraints (unprivileged symlinks in 08/20, mkfifo in 08, SIGTERM/SIGINT process shutdown in 12/13/28, and unsorted directory determinism on ext4) run and pass without a single failure or skip. |

## M1: Foundations, Clock Algebra, CLI Shell, and Init

- **Dependencies:** None.

### Scope

- Establish the shared domain types, error categories, and port contracts.
- Centralize unsigned UTF-8 comparison.
- Implement canonical CLI version parsing and formatting.
- Implement equal/before/after/concurrent comparison, componentwise join, and
  Snap total order.
- Establish strict top-level CLI dispatch and expected/internal error separation.
- Implement repository discovery needed by initialization.
- Implement initialization, including creation, preservation of existing working
  files, and rejection of nested or repeated initialization.

### Exit gate

- Public scenarios 01 and 02 pass.
- Internal tests cover the complete version algebra and version syntax boundaries.
- Public scenario 21 is not an M1 gate because it also requires commit, merge, and
  diff; it closes in M6.
- Type checking, linting, and unit tests pass.

## M2: Configuration and Identity

- **Dependencies:** M1.

### Scope

- Implement strict configuration parsing with duplicate-key and exact-schema
  validation.
- Implement contributor ID validation and spelling preservation.
- Implement local-before-global lookup, invalid-local blocking, unavailable home
  behavior, and missing-identity results.
- Implement local and global configuration writes that replace the document with
  the exact supported shape.
- Keep identity resolution limited to patch-authoring commands.

### Exit gate

- Internal tests cover strict configuration reads/writes, precedence, unavailable
  home behavior, malformed selected configuration, and contributor-ID boundaries.
- Public scenario 03 is deferred to M3 because it invokes commit to demonstrate
  local/global precedence.
- Type checking, linting, and unit tests pass.

## M3: Working Tree and Linear History

- **Dependencies:** M1, M2, and M4.

### Scope

- Scan regular files as exact path-to-bytes trees while excluding metadata and
  ignoring empty directories.
- Reject symlinks, FIFOs, devices, and other unsupported entries without following
  them.
- Compare working and current trees and classify additions, modifications, and
  deletions in canonical order.
- Integrate the shared content algebra into working-tree and same-repository
  historical diff.
- Establish strict repository decoding sufficient for generated linear histories.
- Implement linear-history materialization, patch construction, commit, status,
  and reverse canonical log output with exact escaping.
- Publish commit metadata through a same-directory temporary file and atomic
  replacement.

### Exit gate

- Public scenarios 03, 04, 05, 06, 08, and 25 pass.
- Generated linear repositories round-trip through the strict reader.
- Relevant validation cases from scenario 15 are covered internally, but the full
  scenario closes in M5 after exact-base replay validation exists.
- Type checking, linting, and unit tests pass.

## M4: Canonical Diff and Content Algebra

- **Dependencies:** M1. This pure core may proceed in parallel with M2 and must be
  ready before M3 completes.

### Scope

- Classify text as valid UTF-8 without NUL and preserve arbitrary binary bytes.
- Tokenize immediately after LF while preserving CRLF and unterminated final
  tokens.
- Validate, apply, and coalesce complete edit scripts.
- Implement the exact minimum-edit recurrence with delete-on-tie behavior.
- Use the shared diff to select authored text/put/delete changes.
- Render whole-file text diffs, binary notices, absent-side headers, and final-LF
  markers without platform newline conversion.

### Exit gate

- Internal goldens cover repeated lines, empty text, CRLF, Unicode, invalid UTF-8,
  NUL, operation coalescing, and under/over-consumption.
- Public scenarios 05 and 06 are deferred to M3 because they use commit to create
  their history before invoking diff.
- Type checking, linting, and unit tests pass.

## M5: Full Validation, Deterministic Replay, and OT

- **Dependencies:** M1, M3, and M4.

### Scope

- Complete exact repository schema, canonical-order, dot, contiguity,
  reachability, closure, base-transition, missing-dependency, and cycle checks.
- Materialize each patch's exact base and validate all change preconditions,
  effects, prefix freedom, and non-no-op behavior.
- Implement causal ready-set scheduling with the specified tie breakers.
- Implement deterministic replay from the empty tree.
- Resolve patch-wide namespace conflicts before per-path processing.
- Apply the ordered identical/direct/OT/whole-path decision sequence.
- Implement aggregate-context operational transformation and all split/count/end
  cases.
- Return unique warning facts sorted by path and reason.
- Prove replay convergence independently of repository storage and merge direction.

### Exit gate

- Public scenarios 15, 23, and 27 pass.
- Internal tests cover every OT table row, every whole-path winner, namespace
  conflicts, warning deduplication, and replay/import permutations.
- Public scenarios 10, 11, 17, 18, and 22 are not M5 exit gates because they
  invoke merge; they close in M6.
- Type checking, linting, and unit tests pass.

## M6: Merge and Revert

- **Dependencies:** M2 through M5.

### Scope

- Implement typed patch-set union, dot-collision detection, and frontier join.
- Complete local cross-repository diff with full validation, known-version
  resolution, and typed common-dot collision checks without importing history.
- Compute pre-merge and joined warning sets and emit only net-new warnings.
- Implement idempotent local merge without authoring a patch or requiring identity.
- Implement known-version resolution and additive revert patch generation.
- Reject dirty or unsupported working trees before merge/revert mutation.
- Prepare target trees and repository values completely before writing.
- Materialize file/directory transitions, update working files first, and publish
  metadata only after successful tree installation.

### Exit gate

- Public scenarios 07, 09, 10, 11, 16, 17, 18, 19, 20, 21, and 22 pass.
- Both merge directions and all tested association orders converge to identical
  bytes and warning facts.
- Collision, dirty-tree, unsupported-entry, and no-op paths preserve required
  state.
- Type checking, linting, and unit tests pass.

## M7: CLI Hardening and Presentation

- **Dependencies:** M1 through M6. Basic dispatch was established in M1.

### Scope

- Complete the exact argument grammar for every command and option position.
- Reject unknown, missing, duplicate, misplaced, and extra arguments before use
  case execution.
- Centralize exit 0/1/2 handling and stdout/stderr routing.
- Render semantic outcomes in byte-stable plain and exact ANSI terminal modes.
- Implement color-environment precedence and independent stdout/stderr TTY
  selection.
- Preserve trailing spaces and keep the server startup URL plain in every mode.
- Stabilize the public semantic version output.

### Exit gate

- Public scenarios 14 and 24 pass.
- Internal renderer tests cover every terminal layout used by scenario 28; the
  complete public scenario is deferred to M8 because it starts the HTTP server.
- Internal tests cover automatic TTY selection for stdout and stderr independently,
  because the public harness only captures pipes.
- Type checking, linting, and unit tests pass.

## M8: Embedded HTTP and Remote Repositories

- **Dependencies:** M5 through M7.

### Scope

- Validate once and serve an immutable serialized repository snapshot.
- Bind loopback only, support the configured/default/ephemeral port rules, and
  flush the actual startup URL.
- Implement the exact GET and HEAD resource, zero-byte HEAD body, 404/405 behavior,
  required headers, and clean shutdown on both signals.
- Load remote repositories with exactly one GET of the supplied URL, no redirects,
  status 200 requirement, byte-preserving response handling, and the shared
  repository validator. Do not impose an undocumented repository-size limit.
- Support remote merge and observational cross-repository diff without import.
- Complete terminal-presentation integration with an actual server lifecycle while
  preserving the always-plain startup URL.

### Exit gate

- Public scenarios 12, 13, 26, and 28 pass.
- Internal adapter tests cover exact request targets, immutable snapshots, response
  bounds, signal cleanup, and malformed responses.
- Type checking, linting, and unit tests pass.

## M9: Full Regression and Failure Safety

- **Dependencies:** M1 through M8.

### Scope

- Close all cross-module version, configuration, path, validation, HTTP, and
  presentation boundaries.
- Verify CRLF, Unicode, NUL, canonical base64, safe integers, structural patch
  identity, and exact ordering across local and remote exchange.
- Inject failures before metadata publication and verify accepted partial-write
  behavior without corrupting published history.
- Run deterministic property checks for causal graphs and import permutations.
- Remove duplicate canonical logic, accidental circular dependencies, and
  non-built-in production dependencies.

### Exit gate

- Boundary scenarios 19, 25, 26, and 27 are re-run as focused regression gates.
- The complete public scenario set 01 through 28 passes from a clean install.
- Type checking, linting, all unit/integration/property tests, and architecture
  review pass.
