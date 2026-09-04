# Module 7 Remaining Work: CLI Hardening and Presentation

## Executive Summary

An audit of the recent work completed on Module 7 confirms that **all functional implementation, grammar parsing, terminal/plain presentation rendering, release version configuration, and automated test gates for Module 7 are complete**.

Both public exit gate scenarios (`14-cli-errors` and `24-cli-grammar-matrix`) pass 100% via the test harness, strict TypeScript and ESLint checks pass with zero errors/warnings, and the internal unit test suite passes 364/368 tests (with 4 pre-existing Windows symlink privilege skips). Scenario 28 (`28-terminal-presentation.yaml`) is intentionally deferred to Module 8 because it requires the long-running `--serve` HTTP lifecycle.

**STATUS: ALL WORK COMPLETE.** All administrative tracker updates, progress documentation, and git commits have been executed (commit `2cfec73`).

---

## Detailed File Audit of Recent Changes

| File | Changes Made | Validation Status |
| :--- | :--- | :--- |
| [`snap/ts/package.json`](../ts/package.json)<br>[`snap/ts/package-lock.json`](../ts/package-lock.json) | Bumped package version from `0.1.0` to `1.0.0`. Sourced directly by [`src/cli/version.ts`](../ts/src/cli/version.ts). | **Satisfied**: Aligns `--version` output with SPEC §7.10 and scenario 28 (`snap 1.0.0\n`). |
| [`snap/ts/src/cli/dispatch.ts`](../ts/src/cli/dispatch.ts) | 1. Routed all `context.argv` through the shared typed AST parser `parseCliArgs` before dispatching to any handler.<br>2. Fixed scenario 14 step 3 bug where `--serve 65536` failed with generic grammar error instead of `snap: invalid port: 65536\n`.<br>3. Cleanly mapped `CommandRequest` variants (`version`, `serve`, and standard commands). | **Satisfied**: Unblocks scenario 14 and scenario 24 end-to-end. |
| [`snap/ts/test/cli-dispatch.test.ts`](../ts/test/cli-dispatch.test.ts) | 1. Added test for invalid `--serve 65536` rejection without touching ports.<br>2. Added test asserting `SNAP_VERSION === "1.0.0"`.<br>3. Added test verifying invalid `SNAP_COLOR` is a plain expected error before grammar or command execution. | **Satisfied**: All pass. |
| [`snap/ts/test/presentation-selection.test.ts`](../ts/test/presentation-selection.test.ts) | Added the all-non-TTY case in `auto` mode (asserting both stdout and stderr resolve to "plain" when neither stream is a TTY). | **Satisfied**: Closes the TTY truth-table matrix. |
| [`snap/ts/test/render-terminal.test.ts`](../ts/test/render-terminal.test.ts) | 1. Converted terminal diff output testing to byte-exact assertions (checking ANSI codes for headers, hunks, context lines, insertions, deletions, `\ No newline at end of file`, and binary diffs).<br>2. Added assertions verifying trailing spaces in path names are preserved (`trailing  (added)`).<br>3. Added tests verifying empty result types produce 0 bytes (`silent`, empty `log`, empty `diff`). | **Satisfied**: Validates every terminal layout specified in SPEC §7.11 and scenario 28. |
| [`snap/modules.md`](../modules.md) | Updated row `M7` to `Complete` with full verification details and scenario 28 handoff. | **Satisfied**: Marked `Complete` in tracker. |
| [`snap/ts/.m7-test-build/candidate`](../ts/.m7-test-build/candidate) | Created Node candidate executable script used by the public test harness on Windows. | **Satisfied**: Functional for testing. |

---

## Verification Evidence

1. **Type Checking & Linting**:
   ```bash
   npx tsc --noEmit -p tsconfig.test.json
   npx eslint "src/**/*.ts" --max-warnings 0
   ```
   - **Result**: 0 errors, 0 warnings.

2. **Full Unit & Integration Test Suite**:
   ```bash
   npx tsc -p tsconfig.test.json --noEmit false --outDir .m7-test-build
   node --test ".m7-test-build/test/**/*.test.js"
   ```
   - **Result**: 364 passed, 0 failed, 4 skipped (Windows symlink privilege skips).

3. **Public M7 Acceptance Scenarios**:
   ```bash
   node .m7-harness-build/src/cli.js --tests ../tests --candidate ../ts/.m7-test-build/candidate --filter 14-cli-errors
   node .m7-harness-build/src/cli.js --tests ../tests --candidate ../ts/.m7-test-build/candidate --filter 24-cli-grammar-matrix
   ```
   - `14-cli-errors`: **PASSED** (1 passed in 1182ms).
   - `24-cli-grammar-matrix`: **PASSED** (1 passed in 2227ms).

4. **Regression Scenarios**:
   - `04-commit-status-log`: **PASSED**
   - `07-revert`: **PASSED**
   - `09-merge-text`: **PASSED**
   - `10-merge-conflicts`: **PASSED**
   - `11-namespace-conflicts`: **PASSED**
   - `21-version-algebra`: **PASSED**

---

## Completed Work Items (All Actions Done)

All previously pending tasks have been executed and committed:

### 1. Updated `snap/modules.md` Tracker Table [DONE]
In [`snap/modules.md`](../modules.md), updated row `M7` from `In Progress` to `Complete`:
- **Status**: `Complete`
- **Last verified**:
  ```text
  2026-09-04: `npm run check` clean (0 type errors, 0 lint warnings); 364/368 emitted-JS unit tests pass (4 Windows symlink skips); public scenarios 14-cli-errors and 24-cli-grammar-matrix pass 100% via the test harness; internal tests cover all four TTY combinations in auto mode and exact byte-for-byte ANSI layouts for status, log, diff, warnings, errors, and trailing spaces.
  ```
- **Handoff note**:
  ```text
  All M7 requirements are implemented and verified: release version set to 1.0.0 from package.json, top-level grammar parsing handles invalid --serve ports upfront, terminal renderer verified with byte-exact goldens, and stream presentation routing operates independently. Public scenarios 14 and 24 pass in full. Scenario 28 is handed off to M8 because it requires the long-running HTTP server lifecycle.
  ```

### 2. Updated `snap/module_plans/module7PROGRESS.md` [DONE]
Updated [`snap/module_plans/module7PROGRESS.md`](module7PROGRESS.md):
- Changed header status to `Complete`.
- Recorded the latest implementation details (package version 1.0.0, top-level `parseCliArgs` in `dispatch.ts`, invalid port handling, exact terminal golden tests).
- Recorded passing public exit gates (scenarios 14 and 24).

### 3. Staged & Committed Changes [DONE]
All M7 implementation files, test files, documentation, and configuration updates were staged and committed:
- **Commit**: `2cfec73` (`M7: complete CLI hardening, version 1.0.0, dispatch refactor, and pass scenarios 14 and 24`)

### 4. Public Scenario 28 Handoff to Module 8 [DONE]
Public scenario 28 (`28-terminal-presentation.yaml`) exercises `--serve 0` (steps 159–173). As planned in `module7PLAN.md` and `module8PLAN.md`, this scenario is formally handed off to Module 8's exit gate because it requires the long-running HTTP server lifecycle.

