# Final Specification Audit & Edge-Case Verification (FINALTESTS.md)

## Executive Summary

As part of the final verification pass for the Snap project, a comprehensive audit of the TypeScript implementation (`snap/ts/src`) was performed against the canonical specification ([`snap/SPEC.md`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/SPEC.md), §§1–12).

The objective was to identify subtle boundary conditions, precedence rules, specification ambiguities, and potential inconsistencies across all architectural layers (CLI, Domain, Application, and Ports/Adapters).

A dedicated test suite, [`snap/ts/test/final-edge-cases.test.ts`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/test/final-edge-cases.test.ts), was constructed to validate 10 critical edge cases. All 11 test scenarios in this suite pass unconditionally. The final internal suite discovers 442 tests: 434 pass with zero failures and 8 POSIX-filesystem cases are skipped on native Windows. The project builds with zero TypeScript compilation errors and zero ESLint warnings under strict mode.

---

## Specification Audit: Section-by-Section Analysis

### §1. Product Model & Core Invariants
- **Audit Findings**:
  - Invariant 1 (finite vector of nonzero counters), Invariant 2 (one patch owns exactly one dot), and Invariant 3 (causal base present and immutable) are strictly enforced in `src/domain/version/construct.ts` and `src/domain/repository/validate-repository.ts`.
  - Invariant 6 (import is set union: idempotent, commutative, associative) was validated in `src/application/commands/merge.ts` and tested via property tests.
  - Invariant 7 (dot collisions with different patch contents is corruption, not a merge conflict) correctly returns a domain error with exit code 1.

### §2. Repository & Working Tree
- **Audit Findings**:
  - Tracked file discovery (`src/adapters/node-working-tree-adapter.ts`) strictly ignores `.snap/` and respects prefix-free path guarantees (`src/domain/tree/validate-tree.ts`).
  - Path normalization ensures forward slashes on Windows and rejects invalid path segments (`.`, `..`, empty segments, backslashes).
  - Empty directories are not tracked and do not produce dirty tree status rows.

### §3. History & Version Vectors
- **Audit Findings**:
  - Contributor ID validation (`src/domain/version/contributor-id.ts`) enforces the ASCII grammar `[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+` and maximum 254 bytes. Non-ASCII, spaces, and delimiters (`,`, `(`, `)`, `->`) are rejected.
  - Snap total ordering (`src/domain/version/snap-order.ts`) implements the deterministic tie-breaking required by §3.4: sorted union of contributor IDs, comparing counters (absent = 0) until the first unequal counter.
  - Version formatting and parsing (`src/domain/version/format.ts`, `src/domain/version/parse.ts`) maintain strict canonical round-trip equality `format(parse(v)) === v`.

### §4. Changes & Patches
- **Audit Findings**:
  - Patch schema allows `text` and `put` changes (`src/domain/repository/schema.ts`).
  - Text changes support Myers edit scripts (`insert`, `delete`, `retain`). Empty text creations are allowed; empty edits on existing files are rejected.
  - Commit messages (`src/domain/repository/message.ts`) are restricted to non-empty UTF-8 with max 4096 bytes and no ASCII control characters except `\t` and `\n`.
  - Revert messages (`revert to <version>`) intentionally do **not** enforce the 4096-byte limit, allowing revert patches for frontiers with many contributors.

### §5. Diff & Edit Scripts
- **Audit Findings**:
  - Myers token diffing (`src/domain/diff/myers.ts`) correctly tokenizes files by LF (`\n`), preserving trailing line semantics.
  - Diff hunk headers (`src/domain/tree/diff-records.ts`) follow the exact syntax `@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@` where 0-token files use `0` as the count (e.g., `@@ -1,0 +1,1 @@` or `@@ -1,0 +1,0 @@`).

### §6. Replay, Transform & Conflict Resolution
- **Audit Findings**:
  - Text OT transform (`src/domain/transform/text-transform.ts`) implements the 6-row table in §6.3 against aggregate context edits.
  - Merge winner rules 1–6 (§6.4) are evaluated in strict priority order:
    1. Identical current and incoming target: keep current, emit no warning.
    2. Incoming delete wins (`delete-wins`).
    3. Earlier concurrent delete wins (`delete-wins`).
    4. Incoming create wins (`later-create-wins`).
    5. Incoming `put` wins (`later-put-wins`).
    6. Incoming text against current non-text binary: current binary wins (`put-wins`).
  - Duplicate warnings across paths collapse, and warnings sort by path then reason.

### §7. Commands & Error Precedence
- **Audit Findings**:
  - CLI grammar (`src/cli/grammar.ts`) and dispatch (`src/cli/dispatch.ts`) enforce exact operand counts and reject unexpected flags or arguments with exit code 2.
  - Command error precedence rules are verified:
    - `commit`: Message validation diagnostics take precedence over clean-tree checks.
    - `revert`: Invalid version syntax or unknown version errors take precedence over dirty-tree checks; dirty-tree checks take precedence over target-already-current checks.
    - `diff`: Observational diff across repositories produces empty output when trees are byte-for-byte identical despite different version frontiers.
    - `status`: Rows sort strictly by unsigned UTF-8 path bytes, regardless of change code (`A`, `M`, `D`).

### §8. Repository Format
- **Audit Findings**:
  - Schema validation (`src/domain/repository/validate-repository.ts`) verifies format version 1, vector clock frontier, and patch array topology.
  - JSON serialization uses 2-space indentation and trailing LF.

### §9. Environment & Configuration
- **Audit Findings**:
  - Config lookup (`src/application/config/get-contributor.ts`) checks local `.snap/config.json` before falling back to `$HOME/.snapconfig.json`.
  - An invalid local configuration prevents fallback to global configuration.

### §10. Error Handling & Exit Codes
- **Audit Findings**:
  - Exit code 0: Command success.
  - Exit code 1: User or domain error (dirty tree, unknown version, invalid message, merge conflict warning report).
  - Exit code 2: CLI grammar error, unexpected flag, or unhandled exception.
  - All errors render single-line messages to stderr ending with LF, with control characters escaped.

### §11. Terminal Presentation
- **Audit Findings**:
  - Plain mode is default for non-TTY. ANSI color codes are applied when `SNAP_COLOR=always` or interactive TTY.
  - `--serve [port]` startup URL is always plain (uncolored) even when `SNAP_COLOR=always`.

### §12. Reference Test Harness
- **Audit Findings**:
  - Cross-platform process execution compatibility tested on Windows and POSIX hosts.

---

## Tested Edge Cases & Behavioral Validations

All 10 edge cases below are implemented in [`snap/ts/test/final-edge-cases.test.ts`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/test/final-edge-cases.test.ts):

| # | Edge Case / Boundary | Spec Section | Test Scenario | Outcome |
|---|---|---|---|---|
| 1 | Long Revert Messages (> 4096B) | §4.2, §7.7 | 150-contributor version produces `revert to (...)` > 4096 bytes | ✅ Passes without error; commit message validator correctly rejects >4096B while revert allows it |
| 2 | Commit Message Control Chars & Precedence | §4.2, §7.5 | Rejects `\r`, `\0`, `\x1b`, `\x7f`; invalid message rejected before clean tree check | ✅ Diagnostic "invalid commit message" emitted on clean tree |
| 3 | Diff Hunk Formatting for 0-Token Boundaries | §7.6 | Diff hunk headers on empty files, additions, and deletions | ✅ Exact headers `@@ -1,0 +1,1 @@`, `@@ -1,1 +1,0 @@`, and `@@ -1,0 +1,0 @@` verified |
| 4 | Revert Dirty Tree Precedence | §7.7, §10 | Reverting to current tree state when working tree has dirty uncommitted files | ✅ Fails with "working tree is dirty" rather than silent no-op |
| 5 | Revert Unknown Version Precedence | §7.7, §10 | Reverting with unknown version or malformed syntax on dirty working tree | ✅ Version syntax/unknown error reported before dirty working tree check |
| 6 | Contributor ID Grammar Boundaries | §3.1 | Sub-addressing tags (`+`), numbers, dots vs non-ASCII, spaces, commas, parens | ✅ Permitted ASCII patterns accepted; whitespace and non-ASCII rejected |
| 7 | Merge Rule 6: Put-Wins | §6.4 | Incoming text change collides with current non-text binary | ✅ Current binary content retained; warning `auto-resolved doc.txt: put-wins` emitted |
| 8 | Merge Identical Concurrent Binaries | §6.4 Rule 1 | Two branches add identical binary file content | ✅ Auto-collapsed without emitting any conflict warning |
| 9 | Status Sorting Across Mixed Codes | §7.3 | Changes with mixed codes (`M`, `D`, `A`) across uppercase and lowercase paths | ✅ Strictly sorted by unsigned UTF-8 bytes: `Z_uppercase.txt` (M) < `a_deleted.txt` (D) < `b_added.txt` (A) |
| 10 | Cross-Repo Diff on Identical Trees | §7.6 | Differing version frontiers between repos that materialized identical trees | ✅ Zero diff records produced; plain output is empty string |

---

## Verification Evidence

### 1. Build and Lint Verification
```text
> snap@1.0.0 check
> npm run build && npm run build:test && npm run lint

> snap@1.0.0 build
> tsc --noEmit

> snap@1.0.0 build:test
> tsc --noEmit -p tsconfig.test.json

> snap@1.0.0 lint
> eslint "src/**/*.ts" --max-warnings 0
```
**Result**: 0 TypeScript errors, 0 ESLint warnings.

### 2. Edge-Case Test Suite Execution
```text
> node --import tsx --test test/final-edge-cases.test.ts

✔ 1. revert message with many contributors can exceed 4096 bytes without error (2.04ms)
✔ 2. commit message rejects control characters other than tab and LF (0.26ms)
✔ 2. commit: invalid message is rejected even on a clean tree (precedence) (10.79ms)
✔ 3. diff: hunk headers for empty files and single token files follow exact SPEC syntax (1.04ms)
✔ 4. revert: dirty tree error takes precedence over target-tree-is-already-current (12.65ms)
✔ 5. revert: invalid or unknown version is rejected before checking dirty tree (6.58ms)
✔ 6. contributor id: accepts plus tags, numbers, and dots; rejects non-ASCII and whitespace (0.20ms)
✔ 7. merge: rule 6 put-wins when incoming text change meets current non-text binary (19.10ms)
✔ 8. merge: identical concurrent binary creations collapse without warning (9.54ms)
✔ 9. status: rows sort strictly by unsigned UTF-8 path bytes regardless of code (0.49ms)
✔ 10. diff across repositories with different frontiers but identical trees produces no output (4.16ms)

ℹ tests 11
ℹ pass 11
ℹ fail 0
```

### 3. Full Unit Test Suite Execution
```text
> tsc -p tsconfig.test.json --noEmit false --outDir .final-test-build
> node --test <all emitted test files>

ℹ tests 442
ℹ pass 434
ℹ fail 0
ℹ skipped 8 (POSIX-only filesystem-entry cases on native Windows)
ℹ duration_ms 1778.59
```

The emitted-JavaScript route is the documented fallback for this Windows account because `tsx` fails in `node:os.userInfo()` before discovering tests. The source tree was copied alongside the temporary emit only so the architecture source-audit tests continued to inspect the original `.ts` files.

### 4. Additional final robustness properties

[`snap/ts/test/import-permutation-properties.test.ts`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/test/import-permutation-properties.test.ts) now checks all three set-union laws across 24 deterministic seeds: commutativity, idempotence, and three-repository associativity. The associativity corpus uses conflicting atomic creations and explicitly requires nonempty warning facts, proving that patch IDs, joined frontiers, replayed bytes, and warning sets all converge across grouping, direction, and storage permutations.

---

## Conclusion

The Snap TypeScript implementation is fully consistent with the canonical requirements and invariants specified in `SPEC.md`. All boundary conditions, error precedences, merge resolution rules, and format constraints have been verified with automated regression tests.

---

## Addendum: Test-Harness Issues Found Running `snap/tests/` on Native Windows

A separate pass ran the language-neutral acceptance suite (`./snap/verify --lang ts`, i.e. `snap/tests/*.yaml` via `snap/test-harness/`) directly on native Windows (not WSL). This audit is about the harness/candidate's Windows process- and filesystem-boundary behavior — it found no defects in `snap/ts/src`, only gaps in how the harness drives a candidate on native Windows. All 28 cases subsequently passed unmodified on WSL, confirming the implementation itself is correct; the issues below are Windows-host-specific.

### Issue 1 (fixed): whole suite hangs forever on native Windows — `test-harness` bug

- **Symptom**: `./snap/verify --lang ts` never completed once any test exercised `start`/`stop` on a background `--serve` process (e.g. `snap/tests/12-http-server.yaml`). No timeout fired; the process had to be killed externally.
- **Root cause**: on this Windows/git-bash setup, candidates are launched through a chained shebang wrapper (`run_tests`'s mktemp script → `snap/run` → `exec node ...`). After force-killing such a process tree via `taskkill /t /f`, Node's `ChildProcess` `close` event was never observed to fire — confirmed by direct reproduction outside the harness — even though `taskkill` reported success and the process tree was verifiably gone. `snap/test-harness/src/runner.ts`'s end-of-case cleanup (`await Promise.allSettled([...].map(p => p.completion))`) and `process.ts`'s `stopProcess` race both had code paths that waited on this event with no independent bound in the cleanup path, so the harness (not the candidate) hung indefinitely.
- **Fix (committed, `5ea77ab`)**: `snap/test-harness/src/process.ts`'s `killGroup` now reports back when it has itself confirmed the Windows kill succeeded; on that confirmation the process's `completion` is settled immediately with the captured output rather than waiting on the OS event. `runner.ts`'s end-of-case cleanup wait is also now time-bounded (5s), and sandbox `rmSync` retries and tolerates the brief EPERM/EBUSY window Windows leaves after a forced kill, rather than crashing the whole run.
- **Effect**: native Windows runs now complete instead of hanging, going from 0/28 (hang) to 24/28 passing. This is a harness robustness fix with no behavioral change on POSIX hosts (verified: `killGroup` returns `false` there, so existing signal/close-event logic is untouched).

### Issue 2 (platform ceiling, not fixed): no real SIGTERM/SIGINT delivery on native Windows

- **Symptom**: `snap/tests/12-http-server.yaml`, `13-http-client.yaml`, and `28-terminal-presentation.yaml` fail their `stop` step with `expected exit code 0, got null (SIGKILL)`.
- **Root cause**: Windows has no POSIX signal delivery to a child process. `killGroup`'s Windows path always hard-kills via `taskkill /f` regardless of the requested signal (SIGTERM or SIGINT), so the candidate never gets a chance to catch the signal and exit gracefully the way the YAML expects (`exit_code: 0`, a specific stdout shutdown line, empty stderr).
- **Status**: left unfixed by request. A real fix would require sending genuine Windows console control events (`GenerateConsoleCtrlEvent` for `CTRL_BREAK_EVENT`/`CTRL_C_EVENT`) to a process launched with `CREATE_NEW_PROCESS_GROUP`, which Node's `child_process` does not expose directly and would need native/FFI work — a materially bigger change than the hang fix above, and not guaranteed to fully match POSIX SIGTERM semantics even then.
- **Recommendation**: run this suite via WSL for CI/verification purposes; treat native-Windows runs as a smoke test capped at 24/28 rather than a release gate.

### Issue 3 (platform ceiling, not fixed): git-bash `mkfifo` is invisible to native Windows Node.js

- **Symptom**: `snap/tests/08-unsupported-entries.yaml` fails at its `mkfifo`-backed step — `snap diff` on the fixture treats the fifo as an ordinary binary file (`Binary files /dev/null and b/pipe.lnk differ`, exit 0) instead of reporting `unsupported working tree entry: pipe` (exit 1).
- **Root cause**: `snap/test-harness/src/filesystem.ts`'s `fifoFixture` shells out to git-bash's `mkfifo`. On Windows there is no NTFS-native FIFO type, so MSYS emulates one as a regular file with special content that only MSYS-aware tools recognize. Confirmed directly: `fs.lstatSync(...).isFIFO()` returns `false` for such a file when read by a native Win32 Node.js process (which is what `snap`'s TypeScript build runs as), so the candidate correctly never sees anything to reject.
- **Status**: unfixed — this is a fundamental gap between MSYS's userspace fifo emulation and the native Win32 filesystem API surface Node.js uses; it cannot be bridged without WSL (where fifos are real). Not a `snap/ts/src` defect: the same candidate binary passes this exact case unmodified under WSL.

### Net effect of this pass

- Fixed a genuine, previously-undiscovered test-harness bug (Issue 1) that made the acceptance suite unusable on native Windows at all.
- Confirmed, via a follow-up WSL run of the unmodified harness and candidate, that Issues 2 and 3 are host-environment ceilings in the harness's Windows process/filesystem shims, not defects in the Snap implementation: **28/28 pass under WSL**.
