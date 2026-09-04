# Module 7 Progress: CLI Hardening and Presentation

## Status

**Complete**

All CLI grammar parsing, top-level typed request dispatch, per-stream ANSI/plain presentation rendering, release versioning, and exit-code routing are implemented and pass strict checking. Public exit gates 14 (`14-cli-errors`) and 24 (`24-cli-grammar-matrix`) pass 100%. Scenario 28 is handed off to Module 8 as planned.

---

## Completed Components

### 1. ANSI SGR Primitives (`src/cli/ansi.ts`)
- Implements the exact SPEC §7.11 styling primitive:
  $$S(n, \text{text}) = \text{ESC}[n\text{m}\text{text}\text{ESC}[0\text{m}$$
- Constants for all specified ANSI codes: `1` (bold), `2` (dim), `31` (red), `32` (green), `33` (yellow), `35` (magenta), `36` (cyan).
- Safe handling of empty text (returns empty string without dangling escape sequences).

### 2. Terminal Port & Adapter (`src/ports/terminal-port.ts`, `src/adapters/node-terminal-adapter.ts`)
- Defined `TerminalPort` with readonly functions `isStdoutTty()` and `isStderrTty()`.
- Implemented `createNodeTerminalAdapter()` reading `process.stdout.isTTY` and `process.stderr.isTTY`, with support for injected options to enable deterministic testing without mutating process streams.

### 3. Presentation Resolution (`src/cli/presentation.ts`)
- Implemented `resolvePresentation(env, terminal)` covering the exact SPEC §7.11 truth table:
  - Rejects invalid `SNAP_COLOR` with `snap: SNAP_COLOR must be auto, always, or never\n`.
  - `SNAP_COLOR=always`: forces terminal mode on both streams regardless of `NO_COLOR` or TTY.
  - `SNAP_COLOR=never`: forces plain mode on both streams.
  - `SNAP_COLOR=auto` (or unset):
    - If `NO_COLOR` is present in environment (even empty): selects plain mode for both streams.
    - Otherwise: evaluates stdout and stderr TTY capabilities independently.

### 4. Complete CLI Grammar AST & Parser (`src/cli/command-request.ts`, `src/cli/grammar.ts`)
- Defined `CommandRequest` discriminated union for all commands:
  - `InitRequest` (`init [path]`)
  - `ConfigRequest` (`config [--global] contributor.id <id>`)
  - `StatusRequest` (`status`)
  - `LogRequest` (`log`)
  - `CommitRequest` (`commit <message>`)
  - `DiffRequest` (`diff [<old> <new> [--repo <repository>]]`)
  - `RevertRequest` (`revert <version>`)
  - `MergeRequest` (`merge <repository>`)
  - `ServeRequest` (`--serve [port]`)
  - `VersionRequest` (`--version`)
- Implemented `parseCliArgs(argv)`:
  - Rejects unknown commands, misplaced options, and extra operands before use case execution with `snap: invalid command or arguments\n`.
  - Enforces SPEC §7.10 port parsing for `--serve [port]`: accepts 0–65535, rejects invalid integers or out-of-range numbers with `snap: invalid port: <operand>\n`.
  - Enforces stable diff usage diagnostic for invalid diff syntax: `snap: usage: snap diff [<old> <new> [--repo <repository>]]\n`.

### 5. ANSI Terminal Renderer (`src/cli/render-terminal.ts`)
- Formats `CommandResult` into ANSI terminal presentation per SPEC §7.11:
  - Success lines for `init`, `commit`, `revert`, and `merge` with green checkmark `✓`, bold action label, and cyan version string.
  - Status header, clean tree label, or dirty rows with colored symbols (`+`, `\u2212`, `~`) and dim labels (`(added)`, `(deleted)`, `(modified)`).
  - Log entries with `●` cyan glyphs, bold messages, magenta authors, and double LF spacing between entries.
  - Diff line wrapping with applicable styles (bold headers, cyan hunk headers, green additions, red deletions, dim no-newline markers, yellow binary notices).
  - Terminal formatting for errors (`✗ <error>`) and warnings (`⚠ <detail>`).
  - `--serve` startup URL remains plain in every mode.

### 6. Semantic Results Extension (`src/cli/results.ts`, `src/cli/render.ts`)
- Added `reverted`, `merged`, and `serve-startup` variants to `CommandResult`.
- Updated plain renderer `renderCommandResult` to handle all result types.

### 7. Unit Tests
- `test/ansi.test.ts`: SGR codes and empty string handling (2 tests).
- `test/presentation-selection.test.ts`: all precedence rules for `SNAP_COLOR`, `NO_COLOR`, and TTY (5 tests).
- `test/cli-grammar-matrix.test.ts`: exhaustive grammar tests matching scenarios 14 and 24 (10 tests).
- `test/render-terminal.test.ts`: terminal rendering of status, log, diff, and errors (6 tests).

---

## Remaining Work for M7 Completion

1. **Wire Typed AST into Dispatch**:
   - Update `src/cli/dispatch.ts` to route parsed `CommandRequest` instances directly to command use cases once M6's `merge` and `revert` commands are implemented.
2. **Main Application Presentation Integration**:
   - Update `src/main.ts` to resolve presentation upfront and route stdout/stderr through the selected renderer.
3. **Public Acceptance Verification**:
   - Run and pass public scenarios:
     - `snap/tests/14-cli-errors.yaml`
     - `snap/tests/24-cli-grammar-matrix.yaml`

---

## 2026-09-04 session: independent M7 work completed ahead of M6

Picked up this module to find work that does not depend on M6 (`merge`/`revert`
are still `Not Started`). Found that a concurrent session had, in the
meantime, already landed most of item 2 above directly on `main` (commit
`df00eff "module5"`): `src/main.ts` now constructs a `createNodeTerminalAdapter()`
and passes it through `CliPorts.terminal`, and `src/cli/dispatch.ts` already
called `resolvePresentation` and rendered success/error output through the
plain/terminal renderer pair. **Note for future readers: this working tree is
shared with at least one other concurrently-running agent session** — expect
`git log` to move under you, and diff against current `HEAD` (not this note)
before assuming what is or isn't done.

On top of that baseline, this session completed and verified the following,
entirely independent of M6:

### 1. Fixed `diff` CLI grammar to use the shared parser (real scenario 14/24 bug)

`src/cli/commands/diff.ts` previously had its own ad hoc argument check
(0 args, or exactly 2 args, else `GRAMMAR_ERROR`) that predated
`src/cli/grammar.ts`'s `parseCliArgs`. This produced the wrong diagnostic for
malformed diff invocations: SPEC §7.6/§7.11 and scenario 14/24 require
`snap: usage: snap diff [<old> <new> [--repo <repository>]]` for shapes like
`diff v1` (one operand) or `diff v1 v2 repo --repo` (misplaced `--repo`), but
the old code always emitted the generic `snap: invalid command or arguments`.
Rewrote `diffCommand` to call `parseCliArgs(["diff", ...args])` and dispatch
on the resulting `DiffRequest` (no old/new version -> working-tree diff; both
present and no `repo` -> `diffVersions`; `repo` present -> throws, since
cross-repository diff is M6/§9 scope and not yet implemented). Confirmed via
the real CLI that scenario 14 now passes its diff-usage steps and **scenario
24 (`24-cli-grammar-matrix`) passes in full**:
`./snap/verify --lang ts --filter 24-cli-grammar-matrix` -> 1 passed.

`./snap/verify --lang ts --filter 14-cli-errors` now fails only at the
`revert` step (step 8, "unknown version" from `snap revert`), which is
squarely M6 — everything before it, including the two diff-usage steps this
session fixed, now passes.

### 2. Fixed stale M1-era test invariants broken by presentation resolution

Presentation resolution (SPEC §7.11) now reads `SNAP_COLOR`/`NO_COLOR` via
`EnvironmentPort.getEnv` for **every** command, before grammar is even
checked (an invalid `SNAP_COLOR` is rejected before command execution). Two
pre-M7 test fixtures asserted the opposite ("environment must not be
touched") for commands that don't need contributor-identity lookups
(`init`, grammar-error cases). Updated `throwingEnvironment()` in
`test/cli-dispatch.test.ts` and the inline environment stub in
`throwingPorts()` in `test/cli-config.test.ts` to allow exactly
`SNAP_COLOR`/`NO_COLOR` queries (returning `undefined`) while still throwing
for any other key, preserving the tests' original intent (no
identity/config lookup) without fighting spec-mandated behavior.

### 3. Updated a stale diff grammar test

`test/diff-command.test.ts`'s `"diff: three or more arguments is a grammar
error"` test expected `snap: invalid command or arguments` for
`diff () () ()`. Per `grammar.ts` (already covered by
`test/cli-grammar-matrix.test.ts`) and scenario 24's matrix, an unrecognized
operand-shaped diff invocation is a *usage* error, not a generic grammar
error. Updated the test's name and expectation to match the shared grammar
module's (correct, spec-aligned) behavior.

### Verification run this session

- `npx tsc --noEmit -p tsconfig.test.json`: clean.
- `npx eslint "src/**/*.ts" --max-warnings 0`: clean.
- Full compiled suite via `tsc -p tsconfig.test.json --noEmit false --outDir <dir> && node --test`
  (workaround for the `tsx`/`uv_os_get_passwd` ENOMEM launcher issue noted by
  M1/M2/M4/M5 on this Windows host — plain `tsc` + `node --test` runs fine):
  **325/329 pass, 4 skipped** (pre-existing symlink-privilege skips), 0 fail.
- `./snap/verify --lang ts --filter 24-cli-grammar-matrix`: **passes** (this
  session confirmed the public verifier itself now runs on this Windows host
  — it was blocked by a shebang/`spawn EFTYPE` issue as of M3's handoff note,
  but `test-harness: fix spawn EFTYPE for shebang candidates on Windows`
  (commit `778fa35`) and `test-harness: fix sandbox path validation to use
  POSIX semantics on Windows` (commit `dd25f3a`) landed since then and
  resolved it).
- `./snap/verify --lang ts --filter 14-cli-errors`: fails only at the M6-owned
  `revert` step; the diff-usage steps this session fixed now pass.
- Re-ran `04-commit-status-log`, `05-diff-goldens`, `06-binary-and-empty`,
  `25-config-version-path-boundaries`, and `15` for regression: all still
  pass. `03-configuration` still fails, but on a pre-existing harness bug
  (nested-JSON `}}` misparsed as a `{{...}}` interpolation token), unrelated
  to this session's changes.

---

## 2026-09-04 final session: M7 completion on integrated M6 baseline

Following M6's completion of `merge` and `revert`, this session resolved the remaining M7 requirements, completed the test matrix, and verified the public exit gates:

### 1. Unified top-level grammar dispatch (`src/cli/dispatch.ts`)
- Routed all CLI arguments through `parseCliArgs(context.argv)` before calling any handler.
- Fixed scenario 14 step 3: `--serve 65536` now fails upfront with `snap: invalid port: 65536\n` before any command use cases or port listeners are initialized.
- Mapped all commands (`init`, `config`, `status`, `log`, `commit`, `diff`, `merge`, `revert`, `version`, and `serve`) through typed `CommandRequest` instances.

### 2. Sourced public release version 1.0.0 (`package.json`, `src/cli/version.ts`)
- Bumped `package.json` version to `1.0.0` to meet SPEC §7.10 and public scenario 28 step 54 (`snap 1.0.0\n`).
- Added regression test in `test/cli-dispatch.test.ts` asserting `SNAP_VERSION === "1.0.0"`.

### 3. Tightened presentation & terminal rendering tests (`test/render-terminal.test.ts`, `test/presentation-selection.test.ts`)
- Converted terminal diff output testing to byte-exact ANSI golden assertions covering all line styles (`---`, `+++`, `@@`, `-`, context line, `+`, `\ No newline at end of file`, binary differ notice).
- Added tests asserting trailing whitespace in path names is preserved (`trailing  (added)`) without lossy normalization.
- Verified empty command outputs stay 0 bytes (`silent`, empty `log`, empty `diff`).
- Added test verifying non-TTY auto mode resolves to plain for both streams.

### 4. Verification & exit gates
- `npx tsc --noEmit -p tsconfig.test.json`: clean (0 errors).
- `npx eslint "src/**/*.ts" --max-warnings 0`: clean (0 warnings).
- Unit test suite via emitted JS: **364 passed, 0 failed, 4 skipped** (Windows symlink privilege skips).
- Public acceptance scenario 14 (`14-cli-errors`): **PASSED** in full.
- Public acceptance scenario 24 (`24-cli-grammar-matrix`): **PASSED** in full.
- Regression suite: scenarios 04, 07, 09, 10, 11, 21 all pass.
- Public scenario 28 (`28-terminal-presentation`): handed off to Module 8 as planned (requires `--serve` server lifecycle).

