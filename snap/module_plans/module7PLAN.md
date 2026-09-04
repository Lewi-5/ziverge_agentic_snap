# M7: CLI Hardening and Presentation

## Context

`snap/PLAN.md` assigns M7 the final command grammar, output-channel, exit-code,
and terminal-presentation contract. It depends on M1 through M6. Before starting,
read their tracker handoffs and inventory every semantic command result and
expected error already exposed; M7 changes presentation and dispatch, not domain
or mutation decisions.

We are building **M7: CLI Hardening and Presentation**. M1 established a minimal
strict dispatcher and semantic/plain rendering seam. M7 completes the exact
grammar for all current commands, centralizes expected versus unexpected
failures, selects plain or terminal presentation from environment and per-stream
TTY capabilities, and renders every specified ANSI layout byte-for-byte.

Presentation must remain downstream of execution semantics. Selecting terminal
mode may change only rendering—not validation order, target trees, warning sets,
repository bytes, mutations, or exit status. `--serve` grammar and its always-
plain startup URL are defined here, while the actual HTTP lifecycle arrives in
M8; therefore public scenario 28 closes in M8.

Behavioral authority: `snap/SPEC.md` §§7, 8, and 10. Public exit gate: scenarios
14 and 24, plus internal exact renderer and independent TTY-selection tests.

## Scope

### In scope

- One complete top-level grammar covering every command and positional option.
- Common grammar diagnostics, the special `diff` usage diagnostic, and strict
  port parsing for `--serve`.
- Central mapping of success, expected error, unexpected failure, stdout,
  stderr, and exits 0/1/2.
- Semantic result types for init/config/status/log/commit/diff/revert/merge,
  warnings, errors, version, and prepared serve startup.
- Plain and terminal renderers with exhaustive switches.
- `SNAP_COLOR`/`NO_COLOR` precedence, invalid-value rejection before command
  execution, and independent stdout/stderr `isTTY` decisions.
- Exact ANSI SGR styling for success, status, log, diff, warnings, errors, and
  version output.
- Preservation of path/message whitespace and explicit LF output.
- Set the public package/CLI semantic version to the release value required by
  the acceptance contract (`1.0.0`) from one source.

### Out of scope

- Domain behavior, repository validation, replay, conflict decisions, and
  mutation algorithms already owned by M1–M6.
- HTTP server/client adapters and signal handling (M8).
- New flags, help text, aliases, short options, or commands not present in the
  specification.

## File layout (`snap/ts/src/`)

```text
cli/
  grammar.ts                       [MOD] complete command AST parser
  command-request.ts               [NEW] discriminated parsed command union
  dispatch.ts                      [MOD] parse once, invoke typed handler
  types.ts                         [MOD] semantic execution/output contracts
  results.ts                       [MOD] exhaustive command result records
  errors.ts                        [MOD] expected/internal categories and detail
  presentation.ts                  [NEW] per-stream mode selection
  ansi.ts                          [NEW] SGR primitives only
  render.ts                        [MOD] dispatcher for plain/terminal streams
  render-plain.ts                  [NEW or extracted]
  render-terminal.ts               [NEW]
ports/
  environment-port.ts             [MOD if needed] presence-aware env reads
  terminal-port.ts                 [NEW] stdout/stderr TTY capability snapshot
adapters/
  node-terminal-adapter.ts         [NEW] process stream isTTY values
main.ts                            [MOD] select presentation, write exact streams
test/
  cli-grammar-matrix.test.ts
  cli-exit-routing.test.ts
  presentation-selection.test.ts
  render-plain.test.ts
  render-terminal.test.ts
  cli-whitespace.test.ts
```

The existing file layout may remain if responsibilities are equivalent. The
grammar must return typed requests, command handlers must return semantic
results, and renderers must be the only code that emits ANSI sequences.

## Key behaviors

### 1. Complete strict grammar

Parse the whole `argv` before invoking a use case. Accepted forms are exactly:

```text
snap init [path]
snap config [--global] contributor.id <id>
snap status
snap log
snap commit <message>
snap diff
snap diff <old> <new>
snap diff <old> <new> --repo <repository>
snap revert <version>
snap merge <repository>
snap --serve [port]
snap --version
```

Options are recognized only in the shown positions and at most once. Reject
unknown commands/options, absent operands, extra operands, misplaced/duplicate
options, `--version extra`, and `--serve ... extra` before discovery or writes.
A token beginning with `--` in a position that does not admit that exact option
is an unknown or misplaced option (for example, `init --unknown` is not a path).
Do not invent a general `--` option terminator. Preserve accepted operand
strings exactly.

All grammar failures use:

```text
snap: invalid command or arguments
```

except malformed `diff` shapes, which use one stable line beginning:

```text
snap: usage: snap diff ...
```

The usage detail should state the complete accepted diff forms and is produced
from one constant. Grammar errors never call application use cases.

### 2. Serve port parsing

`--serve` with no operand means 8765. Port `0` requests an ephemeral OS port.
With an operand, accept an ASCII decimal integer in the range 0–65535; reject
signs, fractions, exponent notation, whitespace, non-digits, unsafe values, and
out-of-range numbers. Do not add an undocumented no-leading-zero rule. An
invalid value fails as:

```text
snap: invalid port: <operand>
```

M7 can produce a typed serve request and unit-test parsing even though M8 adds
the executing handler.

### 3. Presentation selection

Resolve presentation before command execution so invalid `SNAP_COLOR` cannot
mutate state. Use exact rules:

| Environment | stdout | stderr |
| --- | --- | --- |
| `SNAP_COLOR=always` | terminal | terminal |
| `SNAP_COLOR=never` | plain | plain |
| unset/`auto`, `NO_COLOR` present (including empty) | plain | plain |
| unset/`auto`, no `NO_COLOR` | terminal iff stdout TTY | terminal iff stderr TTY |

Any other `SNAP_COLOR` value returns the **plain** expected error, regardless of
TTY or `NO_COLOR`:

```text
snap: SNAP_COLOR must be auto, always, or never
```

Capture stdout and stderr capability independently. A success on stdout can be
terminal while a warning/error on stderr is plain, or vice versa. `config`
remains silent. The `--serve` startup URL remains plain in every mode.

### 4. ANSI primitives and escaping

Define one styling primitive:

```text
S(n,text) = ESC + "[" + decimal(n) + "m" + text + ESC + "[0m"
```

Codes are bold 1, dim 2, red 31, green 32, yellow 33, magenta 35, and cyan 36.
Do not sanitize, trim, or normalize semantic message/path text before styling.
All spaces in the layouts are literal and every nonempty record ends in LF.
ANSI is decoration around complete semantic fields; never insert it into
repository data.

### 5. Terminal result layouts

Successful mutation results are:

```text
S(32,"✓") + " " + S(1,label) + " " + S(36,version) + LF
```

Labels are `Initialized repository`, `Committed`, `Reverted`, and `Merged`.

Status begins with:

```text
S(1,"Snap status") + "  " + S(36,version) + LF + LF
```

A clean tree adds two spaces, green `✓`, and ` Working tree clean`. Dirty rows
use two spaces, a styled symbol, one space, the exact path, one space, and a dim
parenthesized label: green `+`/`added`, red Unicode minus `−`/`deleted`, yellow
`~`/`modified`.

Each log entry uses cyan `●`, a bold escaped one-line message, then an indented
line with cyan version, dim `by`, and magenta author. Separate entries with one
additional LF; do not append an extra blank entry after the final record.

`--version` is the entire `snap <semver>` string in bold. Its version comes from
the single package/source constant and must be `1.0.0` for scenario 28.

### 6. Diff styling

First generate the exact plain logical lines from M4. Wrap the complete line
text excluding LF with the first matching style:

1. `--- ` or `+++ ` -> bold;
2. `@@ ` -> cyan;
3. `-` -> red;
4. `+` -> green;
5. `\ ` -> dim;
6. `Binary files ` -> yellow;
7. other/context lines -> unchanged.

Reappend exactly one LF. Empty diff output stays empty. Use semantic line kinds
when available rather than reparsing arbitrary text, but the resulting bytes
must follow this precedence.

### 7. Warnings, errors, and exits

A semantic warning detail such as `auto-resolved same: later-create-wins`
renders plain as `warning: <detail>` and terminal as yellow `⚠`, one space, then
the yellow detail without the `warning:` prefix.

A semantic error line `snap: <detail>` renders terminal as one red styled field
containing `✗ snap: <detail>`. Expected grammar, validation, repository, dirty,
and network-status errors exit 1. Uncaught adapter/programmer failures exit 2.
Both use the selected stderr presentation after a valid presentation policy was
chosen. Keep the invalid-`SNAP_COLOR` error plain.

Main is the only process writer. It writes stdout/stderr exactly once per
immediate command where practical and sets the returned exit code; application
and domain layers never call `console` or `process.exit`.

## Exact tests to write

### Grammar matrix

- Every accepted form maps to the correct typed request with operands preserved.
- Empty argv; unknown command; missing/extra operands for every command;
  unknown, misplaced, and duplicate `--global`/`--repo`; `--version extra`;
  serve extra args; and no use-case call on failure.
- All malformed diff forms use only the diff usage diagnostic; other shapes use
  the common grammar diagnostic.
- Ports: default, 0, 1, 65535 accepted; 65536, negative, plus sign, decimal,
  exponent, whitespace, empty, and nondigits rejected.

### Presentation selection

- `always` overrides present/empty `NO_COLOR` and both non-TTY streams.
- `never` disables both TTY streams.
- unset and explicit `auto` cover all four independent stdout/stderr TTY pairs.
- `NO_COLOR` present with `"1"` and `""` forces both plain only in auto.
- Invalid values fail before a spy command executes and render plain.
- Serve startup record is plain under `always`.

### Renderer goldens

- Every mutation label/version, clean and dirty status, one/multiple log entries,
  escaped/trailing-space messages, version, all diff line families, binary and
  missing-LF lines, warning and error.
- Exact Unicode code points (`✓`, `●`, `⚠`, `✗`, and U+2212 `−`), ANSI reset
  placement, blank lines, spacing, and final LF.
- Empty config/diff/log output remains zero bytes.
- A path ending in a space remains visually distinguishable because the layout's
  separator adds an additional literal space; no trimming occurs.

### Process integration

- Run the scenario 14/24 matrices through the executable and assert no rejected
  command mutates or creates operand paths.
- Exercise terminal records with `SNAP_COLOR=always`, plain pipes with
  `SNAP_COLOR=never`, and version `1.0.0`.
- Unit-test auto TTY behavior with injected capabilities because the public
  harness captures pipes and cannot cover live TTY auto selection.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1–M6 complete; inventory result/error unions; set M7
     `In Progress` with owner/objective.
1. **Typed grammar**
   - Complete request parsing and the grammar/port matrix without invoking use
     cases.
2. **Presentation policy**
   - Add environment/TTY selection and invalid-value preflight with exhaustive
     independent-stream tests.
3. **Renderer split**
   - Extract/retain exact plain rendering, add ANSI primitives and exhaustive
     terminal rendering over semantic results.
4. **Dispatch and exit routing**
   - Wire typed requests/results/errors once; preserve expected/internal exit
     categories and stream independence.
5. **Version and whitespace hardening**
   - Set the release semantic version to `1.0.0` from one source and add exact
     trailing-space/Unicode tests.
6. **Completion and handoff**
   - Run public grammar/error gates and internal scenario-28 renderer coverage;
     document that server lifecycle remains M8.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 14-cli-errors
./snap/verify --lang ts --filter 24-cli-grammar-matrix
```

Also rerun representative plain scenarios for every command (01, 03–07, 09–11,
and 16) to prove presentation refactoring did not change semantics. M7 is
complete only when exact plain/terminal goldens and independent auto-TTY tests
pass. Scenario 28 remains deferred until M8 implements the server lifecycle.
