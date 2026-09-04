# Module 9 Remaining Work: Full Regression and Failure Safety

## Handoff context (2026-09-04)

This document hands off the remainder of M9 to the next agent. Read
[`snap/PLAN.md`](../PLAN.md), [`snap/SPEC.md`](../SPEC.md) (especially §§1.1, 2,
3.5, 4.5, 6.5, 10, 11, 12), and [`module9PLAN.md`](module9PLAN.md) first — this
file only tracks what is left, not the full M9 mandate. Check
[`snap/modules.md`](../modules.md)'s M9 row for the latest status/owner before
starting; it is the authoritative live tracker, this file is a stable plan.

**Before doing anything else**, run `git log --oneline -15` and `git status`.
This repository routinely has multiple concurrent agent sessions sharing one
working tree (see the M9 row's note in `modules.md`). Confirm the working tree
is clean and matches what this document assumes before starting; if it
doesn't, reconcile first rather than assuming this document is current.

### What M9 already completed this session

Do not redo this work; build on it.

1. **Architecture audit fix + regression guard.** `repository-source-adapter.ts`
   (an adapter) was importing application-layer loaders, and
   `repository-source-port.ts` (a port) was importing an application type —
   both inverted `PLAN.md`'s one-way layering. Fixed by moving the pure
   classifier to `src/ports/repository-source.ts` and the composition factory
   to `src/application/repository/create-repository-source.ts`. Added
   [`test/architecture-boundaries.test.ts`](../ts/test/architecture-boundaries.test.ts),
   which statically enforces: every layer only imports the layers PLAN.md's
   diagram allows; production code imports only `node:*` and project-relative
   modules (no stray runtime dependency); and the SPEC §5 delete-on-tie
   recurrence exists in exactly one file (`domain/edit/canonical-diff.ts`).
2. **Working-tree mutation failure injection.**
   [`test/mutation-failure-injection.test.ts`](../ts/test/mutation-failure-injection.test.ts)
   calls `merge`/`revert` directly with real Node adapters plus a deliberately
   failing `TreeMaterializationPort`, proving the SPEC §10 boundary that
   `repository-publication.test.ts` (metadata-write/rename failure only) did
   not reach: a failure *during* the working-tree apply — mid-write, before
   any write, or during removal — still leaves `repository.json` byte-for-byte
   unchanged and history untouched, even though the working tree may be
   partially updated; an unexpected validation failure (dot collision) never
   reaches materialization at all; and the repository is not left permanently
   unusable (reconciling the partial write and retrying succeeds).
3. **Portability integration checks.**
   [`test/portability-boundaries.test.ts`](../ts/test/portability-boundaries.test.ts)
   follows a CRLF/NUL-binary/Unicode-path payload byte-for-byte through the
   real commit pipeline, and proves a local path operand and an HTTP operand
   carrying identical repository JSON produce byte-identical merge results
   end-to-end (the domain-unit suites — strict-utf8, base64, unsigned-utf8,
   tree-path, repository-message — each cover one boundary in isolation only).
4. **A concurrent peer session's serve/HTTP hardening was reviewed and
   committed** (idempotent `HttpServerHandle.close()`, HTTP client protocol
   validation, a `listen()` failure surfacing as an expected `io` error
   instead of an unhandled rejection, and control-character escaping in the
   invalid-port diagnostic). Verified clean before committing; not otherwise
   part of this M9 work.
5. **Full regression baseline established on this Windows host**, individually
   re-verified twice: **25 of 28 public scenarios pass** (01–07, 09–19,
   21–27). The other 3 are confirmed **host limitations, not product
   defects** — see "Known host-specific blockers" below. `npm run check`
   (strict TypeScript + zero-warning ESLint) is clean, and 393+/397 unit tests
   pass (4 pre-existing Windows symlink-permission skips).

### What is NOT done — this document's actual scope

1. Cross-repository import/union permutation property tests.
2. A full per-command grammar/success/error/failure matrix
   (`cli-process-regression.test.ts` from `module9PLAN.md`'s expected file
   impact was never created).
3. The final clean-install gate (`npm ci` from the lockfile, not the
   pre-existing `node_modules`) plus the complete unfiltered `01–28` run.
4. Re-running the 5 host-blocked scenarios (08, 12, 13, 20, 28) on a
   POSIX-capable host (Linux/macOS/WSL/CI), which this Windows session cannot
   do at all.
5. Final `decisions.md`/`modules.md` reconciliation and marking M9 (and the
   project) `Complete` — only after 1–4 above are genuinely done. Per this
   repo's own precedent (`module1REVIEW.md` finding 6, repeated in every
   module's handoff since), a module whose exit gate needs the public
   verifier or a capability this host lacks is not `Complete` on partial or
   host-limited evidence alone.

---

## Known host-specific blockers (do not try to "fix" these in product code)

These were independently confirmed this session, not assumed from prior
handoffs:

- **Scenarios 08, 20** (`08-unsupported-entries`, `20-dirty-merge`): fail with
  `EPERM: operation not permitted, symlink ...`. Windows requires either
  Administrator privileges or Developer Mode enabled to create a symlink at
  all (`fs.symlink`/`mklink`), which this host's account does not have. This
  is a test-setup limitation of the *harness's* symlink creation step, not a
  behavior of `snap` itself — `snap` correctly rejects symlinks it encounters
  (see `node-working-tree-adapter.test.ts`, which exercises this without
  needing to create one).
- **Scenarios 12, 13, 28** (`--serve` lifecycle): the harness's `stop` step
  sends `SIGTERM` (or `SIGINT`) and waits for the child process to exit 0.
  Confirmed directly, independent of the harness: `kill -TERM <pid>` from Git
  Bash against the compiled `snap --serve` binary force-terminates the
  process immediately (exit code 143, i.e. killed-by-signal, not the
  application's own `process.exit(0)`), because **Windows does not deliver a
  catchable SIGTERM to a Node child process at all** — Node's own signal
  emulation on Windows supports SIGINT/SIGBREAK/SIGHUP but not SIGTERM. The
  test harness's own `killGroup` (`snap/test-harness/src/process.ts`) falls
  back to `taskkill /pid <pid> /t /f` on Windows for the same reason — `/f` is
  a force-kill, not a graceful signal, because there is no graceful signal to
  send. `serve()`'s own `SignalPort` wiring is unit-tested with a fake port
  (`serve-command.test.ts`) and is correct; this is purely a Windows/Node
  platform limitation on the *delivery* mechanism, unfixable in application
  code, and normal for local Windows development per this repo's established
  precedent (`module8PROGRESS.md`, `modules.md`'s M8/M3/M6 rows).

**Action required, not a workaround**: run these 5 scenarios on Linux, macOS,
WSL, or CI, and record the pass in `modules.md`. Do not mark M9/the project
complete without this evidence, and do not weaken the harness or the SIGTERM
handling to paper over a Windows-only gap.

---

## Work Package 1: Cross-repository import/union permutation properties

### Current state
[`test/replay-convergence.test.ts`](../ts/test/replay-convergence.test.ts)
already proves, for a single validated repository, that shuffling
`patches` array storage order does not change the materialized tree or the
scheduler's chosen integration order (24 seeds × 8 permutations). This is
real coverage of §6.1's storage-order independence, but it never exercises
**two diverging repositories being merged/imported**, which is the specific
property `module9PLAN.md` and SPEC §11.6/§11.11 ask for: "Check that patch/
import permutations preserve the joined frontier, patch set, replayed bytes,
and warning set."

`test/module6.test.ts` has concrete (non-property, non-seeded) merge/warning
coverage — good regression tests, but they are fixed examples, not generated
permutations.

### What to build
- **File**: `snap/ts/test/import-permutation-properties.test.ts` [NEW]
- For a range of deterministic seeds (reuse the existing seeded generator
  pattern from `replay-convergence.test.ts` — same `Math.imul`-based PRNG, no
  new dependency):
  1. Generate two small valid, causally-independent repository histories
     (disjoint contributor sets is the simplest starting point; a shared
     common-ancestor case is more valuable and closer to the real `merge`
     command — build on `unionRepositoryDocuments`/`validatePreparedRepository`
     from `domain/repository/union.ts`, the same functions `merge.ts` calls).
  2. Union them in both directions (`union(A, B)` vs `union(B, A)`) and with
     different internal patch-array shuffles on each side.
  3. Assert: the resulting typed patch set is identical (as a set, independent
     of array order); the joined frontier is identical; the replayed tree via
     `materializeVersion` is byte-identical; and the sorted warning set
     (`domain/history/warnings.ts`) is identical.
  4. Assert repeated union is a no-op: `union(union(A, B), B)` equals
     `union(A, B)`.
  5. On any assertion failure, print the seed and the two generated
     histories' patches in the failure message (do not change CLI output;
     this is purely for local debuggability, matching `module9PLAN.md`'s "on
     failure, print/retain the seed in the unit-test diagnostic").
- Keep seed counts bounded (e.g. 12–24 seeds × a handful of permutations each,
  similar order of magnitude to `replay-convergence.test.ts`) so the suite
  stays fast and reproducible — this is explicitly a property *sample*, not
  exhaustive search.
- If a genuine convergence bug is found, fix the owning domain file
  (`domain/repository/union.ts`, `domain/history/*`) — never patch the test to
  hide it, and add a minimal regression case to the YAML suite if the bug is
  externally observable per `PLAN.md`'s ambiguity-resolution rule.

---

## Work Package 2: Full command/failure matrix

### Current state
- `test/cli-grammar-matrix.test.ts` covers **accepted grammar forms** for
  every command (init/config/status/log/commit/diff/revert/merge/serve/
  --version), matching the public `24-cli-grammar-matrix.yaml` scenario.
- `test/cli-dispatch.test.ts` covers dispatch-level behavior for a handful of
  cases (`--version`, missing/unknown command, `init` grammar errors and
  success/failure, one generic "unexpected throw maps to exit 2" case) but
  **not systematically for every command**.
- Individual command test files (`commit-command.test.ts`,
  `status-command.test.ts`, `log-command.test.ts`, `diff-command.test.ts`,
  `module6.test.ts` for merge/revert, `serve-command.test.ts`) each cover
  their own command's success/error paths reasonably well in isolation, but
  nothing asserts the **same cross-cutting matrix** for every command in one
  place, which is what `module9PLAN.md` §5 and SPEC §11.7 ask for.

### What to build
- **File**: `snap/ts/test/cli-process-regression.test.ts` [NEW] (the file name
  `module9PLAN.md` names in its expected file impact)
- Use `test/support/real-cli.ts`'s `createRealCli()` (real process-level
  commands, real Node adapters, isolated temp `HOME`/cwd — the same harness
  `module6.test.ts` and `commit-command.test.ts` already use).
- For **every command** (`init`, `config`, `status`, `log`, `commit`, `diff`,
  `revert`, `merge`, `--serve`, `--version`), verify in one table-driven pass:
  1. **Representative success**: a minimal happy-path invocation exits 0 with
     the exact documented stdout shape (reuse SPEC §7's examples).
  2. **Repository discovery from a nested directory**, where the command
     resolves a repository (i.e. every command except `--version` and
     `config --global`): run the command from a subdirectory 2+ levels below
     the repository root and confirm it still finds `.snap/`. Audit which of
     the existing per-command test files already do this (some may — check
     before assuming a gap) and fill in only what's missing.
  3. **Expected error channel**: a representative domain error (e.g. missing
     repository, invalid argument) exits 1, stdout is empty, stderr is
     exactly one `snap: <detail>\n` line.
  4. **Injected unexpected failure**: wrap one port method to throw an
     unexpected (non-domain) error and confirm the command exits 2 — mirror
     the existing pattern in `cli-dispatch.test.ts`'s "an unexpected throw
     from a handler maps to exit 2" test, but repeat it (at least spot-check)
     for a command beyond `init`.
  5. **Read-only commands never mutate**: `status`, `log`, `diff` (all forms)
     leave `.snap/repository.json` and the working tree byte-identical
     before/after, even on their error paths.
  6. **`config` stays silent**: both the local and `--global` forms print
     nothing to stdout on success (SPEC §7.2 — confirm existing coverage in
     `cli-config.test.ts`/`config-process.test.ts` and fold in here only if
     genuinely missing, don't duplicate).
  7. **Identity requirements**: `--version` and `config --global` need no
     repository at all; `merge` needs no contributor identity; only `commit`
     and `revert` resolve/require one (SPEC §8). Confirm each with a direct
     assertion (e.g. run in a directory containing no `.snap/`, or with no
     `contributor.id` configured anywhere, and check which commands still
     succeed vs. which fail with the exact `contributor.id is required...`
     message).
  8. **`SNAP_COLOR`/`NO_COLOR` precedence is re-checked per invocation**, not
     cached: run the same repository state through two consecutive commands
     with different `SNAP_COLOR` values in the same test and confirm both
     presentations are correct independently (existing
     `presentation-selection.test.ts` covers this at the selection-function
     level; this file's job is proving it holds through the real CLI
     end-to-end for at least one representative command).
- This is explicitly a **consolidation and gap-filling** task, not a
  rewrite: audit what already exists per-file first (grep each command name
  across `test/*.test.ts`), and only add what's missing. Do not duplicate an
  existing assertion in a new file merely to have it "in one place" — PLAN.md
  and `module9PLAN.md` both warn against this kind of busywork.

---

## Work Package 3: Clean-install gate

### Current state
This session ran `npm run check`, `npm run test:unit`, and the public
verifier repeatedly, but always against the **pre-existing** `snap/ts/
node_modules` — never from a clean `npm ci`. `module9PLAN.md`'s verification
section requires starting from the lockfile.

### What to do
```bash
cd snap/ts
rm -rf node_modules
npm ci
npm run check
npm run test:unit
```
Then, from the repository root:
```bash
./snap/verify --lang ts --filter 19-version-boundaries
./snap/verify --lang ts --filter 25-config-version-path-boundaries
./snap/verify --lang ts --filter 26-portability-and-failure-safety
./snap/verify --lang ts --filter 27-history-canonicality
./snap/verify --lang ts
```
The last, unfiltered command is expected to hang or time out on this Windows
host at scenarios 12/13/28 (see "Known host-specific blockers"); that is
expected here and is not a new regression. Record the exact `node --version`/
`npm --version` and pass/fail counts in `modules.md` regardless of host, and
additionally run the unfiltered command on a POSIX host to get a true 28/28
result before declaring the project complete.

Also re-run from two portability angles `module9PLAN.md` explicitly calls
for and this session did not attempt:
- a repository root path containing spaces (confirm deliberately rather than assuming), and
- a nested repository `cwd` (covered incidentally by Work Package 2 item 2
  above; no separate action needed once that lands).

---

## Work Package 4: Final documentation and tracker closure

Only after Work Packages 1–3 pass and the 5 host-blocked scenarios have been
independently re-run and confirmed green on a POSIX host:

1. Append any genuine architectural decisions surfaced by the property-test
   or matrix work to [`snap/decisions.md`](../decisions.md) — routine test
   additions do not need an entry; only note something here if it changed a
   canonical rule or fixed a real cross-module bug.
2. Update the M9 row in [`snap/modules.md`](../modules.md):
   - `Complete` only once every item in "What is NOT done" above is
     genuinely finished, including the POSIX-host re-run evidence.
   - Record exact pass counts, seeds/config used for the new property tests,
     platform, and Node/npm versions, per `module9PLAN.md`'s handoff
     requirement.
3. If every criterion in `PLAN.md`'s "Project completion criteria" section
   is met, note the project itself as complete in `modules.md`'s summary —
   but do not do this from Windows-only evidence; the 28/28 unfiltered
   public run must have actually happened somewhere.

---

## Quick-reference verification commands

```bash
# From snap/ts, after implementing Work Packages 1-2:
npm run check
npm run test:unit

# Targeted new-file runs during development:
npx tsx --test test/import-permutation-properties.test.ts
npx tsx --test test/cli-process-regression.test.ts

# From the repository root, Work Package 3:
./snap/verify --lang ts --filter 19-version-boundaries
./snap/verify --lang ts --filter 25-config-version-path-boundaries
./snap/verify --lang ts --filter 26-portability-and-failure-safety
./snap/verify --lang ts --filter 27-history-canonicality
./snap/verify --lang ts   # full 01-28; expect 12/13/28 to hang on Windows
```
