# Module 7 Progress: CLI Hardening and Presentation

## Status

**Partially Implemented (Independent Primitives Complete)**

The independent CLI grammar and terminal presentation primitives for M7 were implemented ahead of M5/M6 in accordance with the architecture plan. All new components pass strict TypeScript type checks, zero-warning ESLint rules, and 23 dedicated unit tests.

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
