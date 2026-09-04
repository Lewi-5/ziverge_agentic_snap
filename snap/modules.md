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
| M1 | Foundations, Clock Algebra, CLI Shell, and Init | — | `Complete` | Claude (TS) | 01, 02 | 2026-09-04: build+lint clean, 57/57 unit tests pass; scenarios 01/02 verified by manual step-for-step replay via `./snap/run` (see note) | Domain (unsigned UTF-8 order, version parse/format/compare/join/Snap order routed through a single validating+immutable `createVersion` constructor), ports+Node adapters (repository discovery now keys on `.snap/repository.json`, not a bare `.snap/` dir, and walks to the nearest existing ancestor when the target is missing), `init` use case, a semantic CLI result/render seam (`cli/results.ts` + `cli/render.ts`, ahead of M7's terminal renderer), unified CLI grammar diagnostic (`snap: invalid command or arguments`) for missing/unknown commands and malformed `init`/`--version` invocations, and `main.ts` are implemented per the layered architecture. `./snap/verify` cannot execute on this Windows host: native Windows Node's `spawn` can't run the harness's shebang wrapper without a shell, and WSL's shared `node_modules` has Windows-only native esbuild binaries. Manually replayed every step of `01-init.yaml` and `02-init-paths.yaml` via `./snap/run` and confirmed byte-exact stdout/stderr/exit codes and repository.json content. Re-run `./snap/verify --lang ts --filter 01-init` / `02-init-paths` on macOS/Linux/CI to get the official harness pass before relying on this as the sole gate. Note: a concurrent peer session (`ziverge-agentic-snap-0e`) was also working in this repo and left `snap/module_plans/` (untracked, plan/corrections/M2-plan notes); its M1 corrections were reviewed and folded into this implementation — coordinate before touching M2 to avoid duplicate work. |
| M2 | Configuration and Identity | M1 | `Complete` | Claude (TS) | Internal configuration/identity gate | 2026-09-04: `npm --prefix snap/ts run check` clean (tsc + eslint zero warnings); `npm --prefix snap/ts run test:unit` 116/116 pass, including all M2 domain/adapter/application/CLI suites. `./snap/verify --lang ts --filter 03-configuration` cannot execute on this Windows host (same native-`spawn`-without-shell limitation recorded in M1); scenario 03 is not an M2 gate regardless since it requires `commit` (M3). | Implemented per plan: fatal-UTF-8 decode (`domain/json/decode-utf8.ts`) and a hand-rolled duplicate-key-detecting strict JSON parser (`domain/json/parse-json-strict.ts`); exact `{"contributor":{"id":...}}` schema validation/serialization (`domain/config/{schema,serialize,types}.ts`) built on a new branded `ContributorId` constructor (`domain/version/contributor-id.ts`); `FileSystemPort.readFileIfExists` (null only for ENOENT/ENOTDIR) and a new `EnvironmentPort`/`NodeEnvironmentAdapter` (injectable, does not touch global `process.env`); `resolveContributorId` (local-strictly-blocks-global precedence, no internal repository discovery) and `setConfig` (validate-before-any-I/O, complete document replacement) application use cases; `snap config [--global] contributor.id <id>` CLI command wired into dispatch with a new silent `CommandResult` render case; `main.ts`/`CliPorts` now wire the environment adapter. All prior M1 fake-port test doubles were updated for the two new port members. One scoped lint exception: `@typescript-eslint/prefer-readonly-parameter-types` false-flags `ContributorId`'s brand intersection when nested in an object parameter type (verified via isolated repro); disabled inline on `serializeConfiguration` only, plus a project-wide `Uint8Array` allow-entry for the same rule (needed for `readFileIfExists`/`decodeUtf8Strict`). Commit/revert (M3/M6) will call `resolveContributorId` themselves; M2 adds no command that calls it. Handoff: M3 can proceed — confirm scenario 03 passes end-to-end once `commit` exists. |
| M3 | Working Tree and Linear History | M1, M2, M4 | `Not Started` | Unassigned | 03–06, 08, 25 | Not run | Integrates identity, content algebra, filesystem, and linear history. |
| M4 | Canonical Diff and Content Algebra | M1 | `Not Started` | Unassigned | Internal content/diff gate | Not run | Scenarios 05 and 06 require commit and close in M3. |
| M5 | Full Validation, Deterministic Replay, and OT | M1, M3, M4 | `Not Started` | Unassigned | 15, 23, 27 | Not run | Merge-driven replay scenarios close in M6. |
| M6 | Merge and Revert | M2–M5 | `Not Started` | Unassigned | 07, 09–11, 16–22 | Not run | Exercises the completed replay engine through public commands. |
| M7 | CLI Hardening and Presentation | M1–M6 | `Not Started` | Unassigned | 14, 24 plus internal presentation gate | Not run | Scenario 28 starts the server and closes in M8. |
| M8 | Embedded HTTP and Remote Repositories | M5–M7 | `Not Started` | Unassigned | 12, 13, 26, 28 | Not run | Completes remote and terminal/server integration. |
| M9 | Full Regression and Failure Safety | M1–M8 | `Not Started` | Unassigned | Re-run 19, 25–27, then 01–28 | Not run | Final clean-install gate. |

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
