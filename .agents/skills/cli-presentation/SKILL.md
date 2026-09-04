---
name: cli-presentation
description: >-
  CLI grammar parsing, exit codes, plain vs. ANSI terminal presentation, and HTTP serve mode for Snap.
  Use when implementing CLI dispatch, formatting output for status/log/diff, handling SNAP_COLOR/NO_COLOR,
  or implementing the embedded HTTP server.
---

# CLI Grammar & Dual-Mode Presentation

This skill specifies CLI dispatch, error handling, plain/terminal formatting, color precedence, and HTTP serving as defined in `SPEC.md` §7, §8, §9, and §10.

---

## 1. CLI Command Surface & Exit Codes (§7, §10)

| Command | Arguments / Flags | Success Output (Plain) | Mutates Disk |
| :--- | :--- | :--- | :--- |
| `init` | `[path]` | `()\n` | Yes (creates repo) |
| `config` | `[--global] contributor.id <id>` | *(silent)* | Yes (config file) |
| `status` | *(none)* | `version <ver>\n[A|M|D] <path>\n...` | No |
| `log` | *(none)* | `<version>\t<author>\t<message>\n...` | No |
| `commit` | `<message>` | `<new-version>\n` | Yes (repo metadata) |
| `diff` | `[<old> <new> [--repo <repo>]]` | Unified diff / binary notice | No |
| `revert` | `<version>` | `<new-version>\n` | Yes (revert patch) |
| `merge` | `<repository>` | Joined `<version>\n` (warnings to stderr) | Yes (syncs & joins) |
| `--serve` | `[port]` | Startup URL (`http://127.0.0.1:<port>/...`) | No |
| `--version`| *(none)* | `snap <semver>\n` | No |

### `commit` change-type selection (§7.5)

`commit` diffs the complete current tree against the complete working tree
and, for each changed path, picks the change variant — this is not free
choice, the spec fixes it exactly:
- **`text`** when the new content is text **and** the old path is either
  absent or was itself text.
- **`put`** otherwise (e.g. new content is binary, or it replaces prior
  binary content).
- **`delete`** for removed paths.

Get this wrong and generated patches will diff/replay incorrectly even if
the OT and tokenization logic (see `canonical-diff`, `operational-transform`)
are themselves correct.

### `revert` no-op error (§7.7)

`revert <version>` requires a **clean** working tree and a **locally known**
target version, diffs current → target, and authors one new patch with
message `revert to <version>`. If the current tree and target tree are
already equal (nothing to revert), it must fail — not succeed silently —
with:
```text
snap: target tree is already current
```
Revert never removes patches or moves the frontier backward; it always adds
a new patch when it succeeds.

### `diff` cross-repository corruption check (§7.6)

For `snap diff <old> <new> --repo <repository>`, before producing any
output, validate *both* repositories and *both* versions, then also check
every dot present in **both** repositories: if a dot's parsed patch value
differs between them, the pair is corrupt and the command must fail rather
than silently diffing against mismatched history. This check is specific to
the cross-repository form and is easy to omit if `diff` is implemented as a
thin wrapper around the local-only case.

### Exit Codes:
- `0`: Success.
- `1`: Expected user/validation errors (e.g., dirty working tree on merge, invalid argument, syntax error). Output: `snap: <detail>\n` to stderr.
- `2`: Unexpected internal errors.

---

## 2. Presentation Modes & Color Precedence (§7.11)

Snap has two output modes:
1. **Plain Mode:** Byte-stable, plain UTF-8 text with LF line endings.
2. **Terminal Mode:** ANSI SGR styled text with colors and Unicode glyphs.

### `SNAP_COLOR` & `NO_COLOR` Rules:
- If `SNAP_COLOR` is invalid (not `auto`, `always`, `never`) $\rightarrow$ emit plain error: `snap: SNAP_COLOR must be auto, always, or never` to stderr and exit 1.
- `SNAP_COLOR=always` $\rightarrow$ Terminal mode on both stdout and stderr, overriding `NO_COLOR`.
- `SNAP_COLOR=never` $\rightarrow$ Plain mode on both streams.
- `SNAP_COLOR=auto` (or unset):
  - If `NO_COLOR` is present in environment (even if empty): Plain mode on both streams.
  - Else: Enable terminal mode on stdout if stdout is a TTY; enable terminal mode on stderr if stderr is a TTY (independent decisions).
- **Special exception:** The startup URL for `--serve` is **always plain**, never styled.

---

## 3. Terminal Formatting Specifications (§7.11)

Style function: $S(n, \text{text}) = \text{ESC}[n\text{m}\text{text}\text{ESC}[0\text{m}$.
Codes: bold `1`, dim `2`, red `31`, green `32`, yellow `33`, magenta `35`, cyan `36`.

### Success Lines (`init`, `commit`, `revert`, `merge`):
$$S(32, \text{"✓"}) + \text{" "} + S(1, \text{label}) + \text{" "} + S(36, \text{version}) + \text{"\n"}$$
Labels: `Initialized repository`, `Committed`, `Reverted`, `Merged`.

### Status Layout:
- Header: $S(1, \text{"Snap status"}) + \text{"  "} + S(36, \text{version}) + \text{"\n\n"}$
- If clean: $\text{"  "} + S(32, \text{"✓"}) + \text{" Working tree clean\n"}$
- Dirty rows: $\text{"  "} + S(\text{color}, \text{symbol}) + \text{" "} + \text{path} + \text{" "} + S(2, \text{"("} + \text{label} + \text{")"}) + \text{"\n"}$
  - Added: `color: 32`, `symbol: "+"`, `label: "added"`
  - Deleted: `color: 31`, `symbol: "−"` (Unicode minus `\u2212`), `label: "deleted"`
  - Modified: `color: 33`, `symbol: "~"`, `label: "modified"`

### Log Layout:
- Row 1: $S(36, \text{"●"}) + \text{" "} + S(1, \text{message}) + \text{"\n"}$
- Row 2: $\text{"  "} + S(36, \text{version}) + \text{" "} + S(2, \text{"by"}) + \text{" "} + S(35, \text{author}) + \text{"\n"}$
- Separate entries with one extra newline (`\n`).

### Diff Line Styling:
Wrap the entire text of each line (excluding final `\n`):
- `--- ` or `+++ ` $\rightarrow S(1, \text{line})$ (bold)
- `@@ ` $\rightarrow S(36, \text{line})$ (cyan)
- `-` $\rightarrow S(31, \text{line})$ (red)
- `+` $\rightarrow S(32, \text{line})$ (green)
- `\ ` $\rightarrow S(2, \text{line})$ (dim)
- `Binary files ` $\rightarrow S(33, \text{line})$ (yellow)

### Warnings & Errors:
- Plain warning: `warning: <detail>\n` $\rightarrow$ Terminal: $S(33, \text{"⚠"}) + \text{" "} + S(33, \text{"<detail>"}) + \text{"\n"}$
- Plain error: `snap: <detail>\n` $\rightarrow$ Terminal: $S(31, \text{"✗ " + error}) + \text{"\n"}$

---

## 4. Embedded HTTP Server (§9)

When `snap --serve [port]` is run:
1. Validate the local repository at startup and capture an immutable in-memory snapshot.
2. Bind to `127.0.0.1` (default port `8765`, port `0` lets OS pick).
3. Print `http://127.0.0.1:<actual-port>/repository.json\n` to stdout (plain) and flush.
4. Endpoints:
   - `GET /repository.json`: return JSON snapshot with `Content-Type: application/json; charset=utf-8`.
   - `HEAD /repository.json`: return same headers without body.
   - Other paths $\rightarrow 404$.
   - Other methods $\rightarrow 405$ with `Allow: GET, HEAD`.
5. Run until `SIGINT` or `SIGTERM`, then gracefully shutdown and exit 0.
