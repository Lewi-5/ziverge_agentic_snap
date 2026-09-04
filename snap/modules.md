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
| M1 | Foundations, Clock Algebra, CLI Shell, and Init | — | `In Progress` | Codex (TS review) | 01, 02 | 2026-09-04: `npm run check` passes, including production and test TypeScript; 154/154 emitted-JavaScript tests pass with `node --test`. The normal `tsx` launcher is host-blocked by `uv_os_get_passwd` ENOMEM, and WSL/bash is access-denied, so the official 01/02 verifier remains outstanding. | Review findings are recorded in `module_plans/module1REVIEW.md` and implemented: `Version` is nominal and constructor-only, invalid-ID diagnostics are escaped, the Linux-only esbuild dependency is removed, repository discovery uses `lstat` entry kinds and rejects symlink traversal, and tests now cover exact repository bytes, resolved-target discovery, outside-to-inside initialization, symlink metadata/path components, sort non-mutation, and test-project type checking. Run `./snap/verify --lang ts --filter 01-init` and `./snap/verify --lang ts --filter 02-init-paths` on CI or a compatible host; mark complete only after both pass. |
| M2 | Configuration and Identity | M1 | `Complete` | Claude (TS) | Internal configuration/identity gate | 2026-09-04: production and test TypeScript builds pass; M2 source lint passes with zero warnings; 130/130 tests pass by emitting the test project and running `node --test`, including strict-JSON prototype-key regressions, direct raw-byte filesystem-adapter boundaries, and local/global subprocess configuration tests. The moving full-worktree `check` is currently red only on nine lint errors in concurrently added M4 `domain/content` and `domain/edit` files. The normal `npm --prefix snap/ts run test:unit` launcher is blocked before discovery on this Windows sandbox by Node/tsx `uv_os_get_passwd` ENOMEM. `./snap/verify --lang ts --filter 03-configuration` remains unavailable on this Windows host and scenario 03 requires M3's `commit`. | Implemented per plan: fatal-UTF-8 decode (`domain/json/decode-utf8.ts`) and a hand-rolled duplicate-key-detecting strict JSON parser (`domain/json/parse-json-strict.ts`); exact `{"contributor":{"id":...}}` schema validation/serialization (`domain/config/{schema,serialize,types}.ts`) built on a new branded `ContributorId` constructor (`domain/version/contributor-id.ts`); `FileSystemPort.readFileIfExists` (null only for ENOENT/ENOTDIR) and a new `EnvironmentPort`/`NodeEnvironmentAdapter` (injectable, does not touch global `process.env`); `resolveContributorId` (local-strictly-blocks-global precedence, no internal repository discovery) and `setConfig` (validate-before-any-I/O, complete document replacement) application use cases; `snap config [--global] contributor.id <id>` CLI command wired into dispatch with a new silent `CommandResult` render case; `main.ts`/`CliPorts` now wire the environment adapter. Strict JSON object construction now preserves `__proto__` as an enumerable own data property, and schema reads require own properties, closing the exact-schema bypass. Direct Node adapter and actual subprocess coverage now exercise the previously missing M2 boundaries. One scoped lint exception remains for `serializeConfiguration`; the project-wide `Uint8Array` allow-entry supports byte ports. Commit/revert (M3/M6) will call `resolveContributorId` themselves; M2 adds no command that calls it. Handoff: M3 can proceed — confirm scenario 03 passes end-to-end once `commit` exists. |
| M3 | Working Tree and Linear History | M1, M2, M4 | `In Progress` | Claude (TS) | 03–06, 08, 25 | 2026-09-04: this module's own files lint-clean in isolation (`npx eslint` scoped to M3 paths); `npx tsc --noEmit` and `--project tsconfig.test.json` clean tree-wide; 296/301 tests pass via `npx tsx --test "test/**/*.test.ts"` (the one failure is in a concurrently-edited M5 `ready-scheduler.test.ts`, not M3; 4 skips are the pre-existing symlink-privilege skip on this Windows host). `./snap/verify --lang ts --filter 04-commit-status-log` now actually spawns (the tsx ENOMEM issue is not present this session) but fails immediately with `spawn EFTYPE`: `run_tests` execs a `#!/bin/sh` wrapper script directly, and Windows `child_process.spawn` cannot interpret a shebang without WSL/Cygwin — a third, more fundamental Windows verifier blocker beyond the ENOMEM issue M1/M2/M4 recorded. Re-run `./snap/verify --lang ts --filter 03-configuration`, `04-commit-status-log`, `05-diff-goldens`, `06-binary-and-empty`, `08-unsupported-entries`, and `25-config-version-path-boundaries` on a compatible host or CI (Linux/macOS/WSL) before marking `Complete`, per `module1REVIEW.md` finding 6's precedent (a module whose exit gate needs the public verifier is not `Complete` on internal tests alone). | All 9 corrections from `module_plans/module3planCORRECTIONS.md` applied. Implemented: tree domain (`domain/tree/{path,construct,compare}.ts`); repository domain (`domain/repository/{message,schema,serialize,linear-history,patch}.ts`, extending the pre-existing `domain/repository/types.ts`) — `validateLinearRepository` decodes and materializes generated (serial, possibly multi-author) linear histories from the empty tree in one pass, reusing M4's `constructEdit`/`applyEdit`/`classifyContent`/`decodeBase64`/`selectAuthoredChanges`, and now also returns every known version's materialized tree (`LinearRepository.versions`) so `status`/`log`/`diff`/`commit` never re-replay history; working-tree scanning (`ports/working-tree-port.ts` + `adapters/node-working-tree-adapter.ts`, non-following, root-only `.snap` exclusion); atomic repository publication (`application/repository/publish-repository.ts`, same-directory temp file + durable flush + rename, with a failure-injection test proving no mutation on a failed rename); `application/repository/load-local-repository.ts` (the one discovery+decode+validate entry point); `application/commands/{status,log,diff,commit}.ts` and their CLI wiring (`cli/commands/*.ts`, `cli/dispatch.ts`, `cli/render.ts`, `cli/results.ts`). Process-level tests reproduce the exact scenario 04/05/06/25 goldens (repeated-line diff, binary/empty files, the tab/LF/backslash log-escape case, invalid/unknown version diagnostics) plus the multi-author serial-commit case (corrections doc #7) through the real Node adapters. This session's working tree was shared with concurrent M4-M8 work landing in parallel (visible as interleaving edits to shared files such as `domain/repository/types.ts`/`schema.ts` and `cli/results.ts`/`render.ts`); only M3-owned files were staged and committed here (commit `M3: status/commit/log/diff commands, wired end-to-end`), and the module's own scope is complete pending the public verifier re-run named above. Note for the next handoff reader: after that commit landed, the concurrently-running M5 session began replacing M3's `LinearRepository`/`validateLinearRepository` call sites in `application/commands/*.ts` and `load-local-repository.ts` with its own `ValidatedRepository`/`validateRepository`/`materializeVersion`/`schedulePatches` (uncommitted at the time this note was written) — expected and desirable per `linear-history.ts`'s own doc comment (M5 supersedes the M3 staged validator), but it means the *working tree* had already moved past the exact commit above by the time this row was last edited; re-diff `git log` for this module's true final integrated state rather than assuming the commit above is still what's on disk. |
| M4 | Canonical Diff and Content Algebra | M1 | `Complete` | Codex (TS) | Internal content/diff gate | 2026-09-04: `npm run check` clean; 154/154 tests pass after `tsc` emit + `node --test` | Implemented immutable byte-preserving content classification/tokenization, strict canonical base64, validated/applicable/coalesced edits, exact delete-on-tie DP diff, sorted text/put/delete selection, semantic diff records, and LF-exact plain rendering. M3 must use `selectAuthoredChanges` for commit/revert and `buildDiffRecords` + `renderDiffPlain` for displayed diff; M5 must reuse `constructEdit`, `applyEdit`, `coalesceOperations`, and `canonicalDiff`. Standard `npm run test:unit` is launcher-blocked on this Windows account because `tsx` fails in `os.userInfo()` with `uv_os_get_passwd ENOMEM`; compiling the unchanged suite and running Node directly passes all 154 tests. Public scenarios 05/06 remain deferred to M3. |
| M5 | Full Validation, Deterministic Replay, and OT | M1, M3, M4 | `In Progress` | Codex (TS) | 15, 23, 27 | 2026-09-04: post-M3 reconciliation `npm run check` passes; 43/43 focused M5/reconciliation tests pass, and the combined M3 command/M5 replay subset passes 58 tests with 2 Windows symlink-permission skips. Public 04, 05, 06, 15, 23, 25, and 27 all pass through the emitted-JavaScript harness workaround. | M5 now fully supersedes M3's staged linear boundary: the misleading `validateLinearRepository` compatibility alias and exported validated-brand constructor are removed; `materializeVersion` and known-version selection require `ValidatedRepository`; status/diff/commit preserve that opaque boundary; schema/patch documentation names the M5 validator; and three real-CLI bridge tests cover concurrent status/log ordering, causal-join diff, and committing atop a multi-author frontier. The original split-cursor OT, exact-base replay, scheduler, namespace/path rules, and convergence coverage remain intact. Scenario 03's harness interpolation issue and scenario 08's Windows symlink EPERM remain outside M5; keep `In Progress` under the strict completion rule. |
| M6 | Merge and Revert | M2–M5 | `In Progress` | Codex (TS) | 07, 09–11, 16–22 | 2026-09-04: `npm --prefix snap/ts run check` passes; emitted-JS unit suite passes 341/345 with 4 Windows symlink-permission skips. Public 07, 09, 10, 11, 16, 17, 18, 19, 21, and 22 pass; 20 passes its dirty-tree assertions but the harness is host-blocked when creating its symlink (`EPERM`). Regressions 05, 06, 15, 23, 24, 25, and 27 pass; 08 is likewise host-blocked at symlink creation. | Implementation is complete: shared strict repository decoder/prepared validator, typed collision-safe union/frontier join, source-neutral operand port with exact local-root adapter, observational cross-repository diff, warning subtraction, pure mutation plans and binary Node materializer, additive revert, idempotent merge, structured plain/terminal warnings, CLI wiring, and M8-compatible source seam. Re-run public 08 and 20 on a symlink-capable host; mark `Complete` once both full scenarios pass. |
| M7 | CLI Hardening and Presentation | M1–M6 | `Complete` | Codex (TS) | 14, 24 plus internal presentation gate | 2026-09-04: `npm run check` clean (0 type errors, 0 lint warnings); 364/368 emitted-JS unit tests pass (4 Windows symlink skips); public scenarios 14-cli-errors and 24-cli-grammar-matrix pass 100% via the test harness; internal tests cover all four TTY combinations in auto mode and exact byte-for-byte ANSI layouts for status, log, diff, warnings, errors, and trailing spaces. | All M7 requirements are implemented and verified: release version set to 1.0.0 from package.json, top-level grammar parsing handles invalid --serve ports upfront, terminal renderer verified with byte-exact goldens, and stream presentation routing operates independently. Public scenarios 14 and 24 pass in full. Scenario 28 is handed off to M8 because it requires the long-running HTTP server lifecycle. |
| M8 | Embedded HTTP and Remote Repositories | M5–M7 | `In Progress` | Claude (TS) | 12, 13, 26, 28 | 2026-09-04: `npx tsc --noEmit -p tsconfig.test.json` and `npx eslint "src/**/*.ts" --max-warnings 0` both clean; 378/382 emitted-JS unit tests pass (4 pre-existing Windows symlink-permission skips), including 13 new M8 tests (`serve-command.test.ts`, `server-presentation.test.ts`, `remote-merge-diff.test.ts`, plus the pre-existing adapter tests). Public scenario `26-portability-and-failure-safety` passes end-to-end through the real harness/binary on this host. Scenarios `12-http-server`, `13-http-client`, and `28-terminal-presentation` each spawn `snap --serve` and then send it a default-signal (`SIGTERM`) `stop` step; on this Windows host `child_process.kill('SIGTERM')` (used by both the test harness's `killGroup` and a manual `kill -TERM` from Git Bash, confirmed directly against the compiled binary) force-terminates the Node process instead of delivering a catchable signal, so `process.on('SIGTERM', ...)` never fires and the harness hangs waiting for the process to exit 0. `SIGINT` was also observed not to reliably reach the child through this host's signal path. This is a platform limitation of Windows/Git Bash signal delivery to child Node processes, not an application defect — see module1REVIEW.md finding 6's precedent (a module whose exit gate needs the public verifier is not `Complete` on internal tests alone). Re-run `12-http-server`, `13-http-client`, and `28-terminal-presentation` on a compatible host (Linux/macOS/WSL/CI) before marking `Complete`. | Implemented per plan: `load-remote-repository.ts` (one GET, required HTTP 200, shared fatal-UTF-8/duplicate-JSON/schema/full-validation decoder, no retry); `repository-source-adapter.ts` (replaces the M6 local-only stub, dispatching `http(s)://` operands to the remote loader and everything else to the existing local operand loader) — merge/diff needed zero changes since both already went through `RepositorySourcePort`; `application/commands/serve.ts` (validate-before-bind, canonical immutable snapshot bytes captured once, loopback bind via `HttpServerPort`, SIGINT/SIGTERM registration only after listening, idempotent close/unregister); a new `OutputPort`/`node-output-adapter.ts` plus `CliPorts.output` so `dispatch.ts` can await-flush the plain startup URL through the real stdout pipe *before* awaiting the server's `closed` promise — the architectural requirement the test harness's `ready`-pattern readiness check depends on; `dispatch.ts` special-cases `"serve"` the same way it already special-cased `"version"`, since a long-running command cannot fit the synchronous-result `Command` shape every other handler uses; `main.ts` now wires `createNodeHttpClientAdapter`, `createNodeHttpServerAdapter`, `createNodeSignalAdapter`, and `createNodeOutputAdapter` alongside the renamed `createRepositorySourceAdapter`. The pre-existing HTTP server/client/signal adapters from the earlier session's baseline work were reused unchanged. New tests cover: validation-before-listen (zero `listen` calls on an invalid repository), snapshot immutability after an on-disk mutation, exact loopback URL shape, idempotent signal unregistration, dispatch-level readiness-flush ordering (asserted mid-flight, before the signal fires), plain-URL invariant under `SNAP_COLOR=always`, one-GET remote loading with HTTP-status/malformed-JSON/schema-violation/collision failure paths, and zero local mutation on every remote failure. Handoff to M9: implementation and all host-runnable verification are complete; the only remaining action is re-running the three signal-dependent public scenarios on a POSIX host, which is expected to pass unchanged given `serve()`'s own signal-handling logic is fully covered by the fake-`SignalPort` unit tests. |
| M9 | Full Regression and Failure Safety | M1–M8 | `In Progress` | Claude (TS) | Re-run 19, 25–27, then 01–28 | 2026-09-04: `npm run check` clean; 393/397 unit tests pass (4 pre-existing Windows symlink-permission skips) after adding 9 new M9 tests across 3 files. Ran all 28 public scenarios individually, twice (before and after this session's fixes): 25 pass every time (01–07, 09–19, 21–27); 08 and 20 fail only on Windows `EPERM` creating a symlink (host lacks admin/Developer Mode, a pre-existing documented limitation, not a product defect); 12, 13, and 28 hang because Windows does not deliver a catchable SIGTERM to a Node child process at all (confirmed directly: both a plain `kill -TERM` and the harness's own `taskkill /f` force-terminate the process rather than trigger `process.on('SIGTERM', ...)`), matching M8's handoff note precisely — this is a Windows/Node platform limitation, not a snap defect. Re-run 08, 12, 13, 20, and 28 on a compatible host (Linux/macOS/WSL/CI) before marking M9/project complete; every other scenario and the full internal suite already pass unfiltered on this host. | Landed this session: (1) `repository-source-adapter.ts`/`repository-source-port.ts` had two reversed dependency edges (an adapter importing application-layer loaders; a port importing an application type), inverting PLAN.md's one-way layering — moved the pure classifier to `ports/repository-source.ts` and the composition factory to `application/repository/create-repository-source.ts`, and added `test/architecture-boundaries.test.ts` (layering edges, non-built-in production imports, single-owner canonical diff recurrence) so this can't silently regress. (2) `test/mutation-failure-injection.test.ts`: calls `merge`/`revert` directly with real Node adapters plus a deliberately failing `TreeMaterializationPort` to prove the SPEC §10 boundary the existing `repository-publication.test.ts` didn't reach — a failure during the *working-tree* apply (not just metadata publish) still leaves `repository.json` byte-unchanged and history untouched, a validation failure (dot collision) never reaches materialization at all, and the repository is not left permanently unusable after reconciling a partial write. (3) `test/portability-boundaries.test.ts`: CRLF/NUL-binary/Unicode-path payloads followed byte-for-byte through the real commit pipeline, plus a direct proof that a local path operand and an HTTP operand carrying identical repository JSON produce byte-identical merge results. Remaining M9 scope not yet done: a property-test pass for cross-repository import/union permutation convergence (single-repo storage-permutation convergence is already covered by `replay-convergence.test.ts`), a full command/failure matrix per `cli-grammar-matrix.test.ts`/`cli-dispatch.test.ts` gap analysis, and the final clean-install (`npm ci`) gate. Note: this working tree is shared with several concurrently active peer sessions (visible via ListAgents); in-flight edits to `serve.ts`, `grammar.ts`, and the HTTP adapters (idempotent `close()`, protocol validation, listen-failure handling) were observed mid-session and intentionally left uncommitted for their own session to land — do not attribute them to this M9 owner, and re-diff before assuming this row's commits are the complete M9 state. |

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
