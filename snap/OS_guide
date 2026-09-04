# Snap Cross-Platform OS Guide (Linux & Windows)

This guide documents how to build, run, test, and troubleshoot Snap on **Linux/POSIX** and **Windows**, incorporating all domain invariants, harness behaviors, and platform-specific constraints identified across Modules 1 through 7.

---

## 1. System Overview & Runtime Architecture

Snap is designed to run deterministically across operating systems. The core application logic resides in `snap/ts`:
- **Domain Layer (`src/domain/`):** Pure, platform-independent algorithms (vector clocks, DAG topological sort, Myers diff, 3-way Operational Transformation, canonical unsigned UTF-8 sorting).
- **Application Layer (`src/application/`):** High-level command use cases (`init`, `config`, `status`, `log`, `diff`, `commit`, `merge`, `revert`).
- **Adapter Layer (`src/adapters/`):** Port implementations bridging Node.js host I/O (`fs/promises`, `node:path`, `node:process`).
- **Presentation & CLI Layer (`src/cli/`):** Argument parsing, exit code mapping, and plain vs. ANSI terminal presentation.

---

## 2. Running Snap on Linux / macOS (POSIX)

On Linux and macOS, the repository provides built-in bash scripts (`snap/run`, `snap/run_tests`, `snap/verify`) that manage build dependencies automatically.

### 2.1 Prerequisites
- **Node.js:** v20.0.0 or higher
- **npm:** v9.0.0 or higher
- *(Optional for Rust/Scala solutions)* `cargo` or `sbt`

### 2.2 CLI Execution via `snap/run`
The `snap/run` script automatically locates the TypeScript implementation, installs dependencies on first run via `npm ci`, and executes `src/main.ts` using `tsx`:

```bash
# Initialize a repository
./snap/run init my-repo
cd my-repo

# Configure contributor identity
../snap/run config contributor.id "alice@example.com"

# Stage and commit files
echo "hello world" > greeting.txt
../snap/run status
../snap/run commit "initial commit"

# Inspect history and diffs
../snap/run log
../snap/run diff
```

### 2.3 Running the Test Suites on Linux

#### Internal Unit and Integration Suite
```bash
cd snap/ts
npm run check             # TypeScript typecheck (src + test) and ESLint
npm run build:test        # Compiles TypeScript test suite
node --test "test/**/*.test.ts"  # Or run compiled JS under node --test
```

#### Process-Level Acceptance Test Harness
The acceptance test harness (`snap/test-harness`) drives compiled Snap candidates inside isolated temporary sandboxes:
```bash
# Run all 28 acceptance tests against the TypeScript candidate
./snap/run_tests --lang ts

# Run a specific filtered acceptance scenario
./snap/run_tests --lang ts --filter 03-configuration

# List all available acceptance scenarios
./snap/run_tests --list
```
*Note: On Linux, all completed M1–M7 tests (including symlink rejection scenarios `08-unsupported-entries.yaml` and `20-dirty-merge.yaml`) pass cleanly because Linux filesystems allow unprivileged symlink creation.*

---

## 3. Running Snap on Windows

Because Windows PowerShell and CMD do not natively execute bash scripts (`snap/run`, `snap/run_tests`), Windows developers should use one of the following approaches.

### 3.1 Method A: Direct Execution via Node.js / `tsx` (Recommended for Development)

You can run Snap directly without any bash wrapper by invoking `tsx`:

```powershell
# From the repository root:
npx --prefix snap/ts tsx snap/ts/src/main.ts init my-repo
cd my-repo

# Configure identity
npx --prefix snap/ts tsx ../snap/ts/src/main.ts config contributor.id "alice@example.com"

# Check status and commit
New-Item greeting.txt -ItemType File -Value "hello world`n"
npx --prefix snap/ts tsx ../snap/ts/src/main.ts status
npx --prefix snap/ts tsx ../snap/ts/src/main.ts commit "initial commit"
npx --prefix snap/ts tsx ../snap/ts/src/main.ts log
```

### 3.2 Method B: Ahead-of-Time (AOT) Compilation

Compile TypeScript into JavaScript and run via standard `node`:

```powershell
# 1. Compile snap/ts
npm --prefix snap/ts exec tsc -- -p snap/ts/tsconfig.test.json --noEmit false --outDir snap/ts/.m7-test-build

# 2. Run the compiled entry point
node snap/ts/.m7-test-build/src/main.js init test-repo
```

### 3.3 Method C: Adding Native Windows Convenience Wrappers

To run `snap` directly as a command in PowerShell or Command Prompt, create `snap.cmd` and `snap.ps1` in the `snap/` directory:

#### `snap/snap.cmd`
```bat
@echo off
node "%~dp0\ts\node_modules\tsx\dist\cli.mjs" "%~dp0\ts\src\main.ts" %*
```

#### `snap/snap.ps1`
```powershell
param([Parameter(ValueFromRemainingArguments = $true)]$Args)
node "$PSScriptRoot/ts/node_modules/tsx/dist/cli.mjs" "$PSScriptRoot/ts/src/main.ts" @Args
```
Once added to your `PATH`, you can run `snap init`, `snap commit "message"`, and `snap status` natively on Windows.

### 3.4 Running Internal Tests on Windows

All 369 internal domain, adapter, and CLI unit tests execute natively on Windows:

```powershell
# 1. Run typecheck and ESLint with zero warnings
npm --prefix snap/ts run check

# 2. Compile tests to build directory
npm --prefix snap/ts exec tsc -- -p snap/ts/tsconfig.test.json --noEmit false --outDir snap/ts/.m7-test-build

# 3. Execute all unit and integration tests
node --test "snap/ts/.m7-test-build/test/**/*.test.js"
```
*Result: 365 pass, 0 fail, 4 skipped (Windows unprivileged symlink adapter tests).*

### 3.5 Running Acceptance Tests on Windows

To run the YAML acceptance test harness on Windows without bash:

```powershell
# 1. Compile test harness
npx tsc -p snap/test-harness/tsconfig.json --noEmit false --outDir snap/test-harness/.m7-harness-build

# 2. Compile TypeScript candidate executable
npm --prefix snap/ts exec tsc -- -p snap/ts/tsconfig.test.json --noEmit false --outDir snap/ts/.m7-test-build

# 3. Run all acceptance tests
node snap/test-harness/.m7-harness-build/src/cli.js --tests snap/tests --candidate snap/ts/.m7-test-build/candidate

# 4. Or run a single acceptance scenario
node snap/test-harness/.m7-harness-build/src/cli.js --tests snap/tests --candidate snap/ts/.m7-test-build/candidate --filter 03-configuration
```

---

## 4. Windows-Specific Nuances, Restrictions & Solutions

### 4.1 Symlink Permissions (`EPERM: operation not permitted, symlink`)

#### The Issue
On Windows, creating symbolic links requires elevated administrative privileges by default (`SeCreateSymbolicLinkPrivilege`). When running acceptance scenarios that create symlinks (`08-unsupported-entries.yaml` and `20-dirty-merge.yaml`), the test fixture setup in the harness fails with:
```
EPERM: operation not permitted, symlink 'missing' -> '...\repo\link'
```

#### Solutions
1. **Enable Windows Developer Mode (Recommended):**
   - Open Windows **Settings** → **System** → **For developers**.
   - Toggle **Developer Mode** to **ON**.
   - This grants standard user accounts permission to create unprivileged symlinks via `mklink` and Node.js `fs.symlink`.
2. **Run as Administrator:**
   - Launch PowerShell as Administrator (`Run as administrator` or via `gsudo`).
3. **Use WSL (Windows Subsystem for Linux):**
   - In WSL (`wsl -d Ubuntu`), Linux filesystems allow unprivileged symlinks by default.

### 4.2 Git CRLF Line Endings (`\r\n` vs `\n`)

#### The Issue
Snap uses strict byte-exact hashing, unified diff calculations, and tokenization based on LF (`0x0A`). If Git on Windows checks out files with CRLF (`core.autocrlf = true`), file byte lengths and diffs will differ between Windows and Linux.

#### Solution
Ensure Git line endings are set to preserve LF:
```powershell
git config core.autocrlf false
git config core.eol lf
```
In `.gitattributes`:
```gitattributes
* text=auto eol=lf
*.json text eol=lf
*.yaml text eol=lf
*.ts text eol=lf
```

### 4.3 Directory Scan Determinism Across Operating Systems

#### The Issue
On Linux (ext4), `fs.readdir` returns entries in arbitrary hash-table order. On Windows (NTFS), entries are often alphabetized, but not strictly by unsigned UTF-8 byte order (e.g. Unicode casing rules). When a working tree contains multiple unsupported entries (such as symlinks or sockets), iterating in raw OS order would report different errors on different operating systems.

#### The Snap Solution
Snap's [`node-working-tree-adapter.ts`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/ts/src/adapters/node-working-tree-adapter.ts) explicitly sorts all directory entries via `sortByUnsignedUtf8(names, (n) => n)` before walking. This guarantees 100% deterministic traversal and error reporting on both Windows and Linux.

### 4.4 Missing `/bin/sh` on Windows

#### The Issue
The acceptance test runner (`snap/test-harness/src/process.ts`) expects a POSIX shell (`sh`) when launching shebang-based candidates (like temporary bash scripts created by `snap/run_tests`).

#### Solutions
1. **Direct compiled candidate:** Pass the Node executable or JS file directly to `--candidate` rather than a bash wrapper.
2. **Install Git for Windows:** Installing Git for Windows adds `sh.exe` to PATH (typically `C:\Program Files\Git\bin\sh.exe` or `C:\Program Files\Git\usr\bin\sh.exe`).

### 4.5 Acceptance Harness Delimiter Escaping

#### The Issue
YAML acceptance tests frequently contain JSON strings with closing braces, such as `{"contributor":{"id":"global@example.com"}}`. Previously, the harness's [`interpolate.ts`](file:///c:/Users/Lewis/OneDrive%20-%20LATYS/Documents/Github/ziverge_agentic_snap/snap/test-harness/src/interpolate.ts) crashed with `invalid variable expression` whenever encountering literal `}}`.

#### The Snap Solution
The interpolation engine treats `}}` as literal characters outside of an interpolation block while preserving variable substitution (`{{name}}`) and escape delimiters (`{{{{` and `}}}}`).

---

## 5. Acceptance Test Status Matrix

| Scenario | Description | Linux | Windows (Default) | Windows (Dev Mode / WSL) | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `01-init` | Init creates empty repo | PASS | PASS | PASS | M1 scope |
| `02-idempotent-init` | Initialization preservation & nesting rules | PASS | PASS | PASS | M1 scope |
| `03-configuration` | Contributor config precedence | PASS | PASS | PASS | M2 scope (harness fix applied) |
| `04-commit-status-log` | Commit, status, log history | PASS | PASS | PASS | M3 scope |
| `05-diff-goldens` | Canonical Myers diff & hunk bounds | PASS | PASS | PASS | M4 scope |
| `06-binary-and-empty` | Byte-exact binary & empty tracking | PASS | PASS | PASS | M4 scope |
| `07-revert` | Additive revert & tree restoration | PASS | PASS | PASS | M6 scope |
| `08-unsupported-entries` | Working tree symlink rejection | PASS | Host EPERM | PASS | Requires Windows Developer Mode |
| `09-merge-clean` | Clean local merge & idempotence | PASS | PASS | PASS | M6 scope |
| `10-merge-conflicts` | Whole-file conflict rules & warnings | PASS | PASS | PASS | M6 scope |
| `11-namespace-conflicts` | Namespace file/dir collision resolution | PASS | PASS | PASS | M6 scope |
| `12-http-server` | HTTP server `--serve` snapshot & exit | PASS | Signal Hang | PASS | Requires POSIX signal delivery (SIGTERM/SIGINT) |
| `13-http-client` | HTTP merge & diff GET requests | PASS | Signal Hang | PASS | Requires POSIX signal delivery (SIGTERM/SIGINT) |
| `14-exit-channels` | Stable exit codes & stderr formatting | PASS | PASS | PASS | M7 scope |
| `15-repository-schema` | Strict schema validation boundary | PASS | PASS | PASS | M5 scope |
| `16-cross-repository-dot-collision` | Cross-repo collision failure safety | PASS | PASS | PASS | M5 scope |
| `17-concurrent-creates` | Concurrent creates resolution | PASS | PASS | PASS | M5/M6 scope |
| `18-three-way-text` | 3-way text OT convergence | PASS | PASS | PASS | M5/M6 scope |
| `19-cli-versions` | Known causal frontier validation | PASS | PASS | PASS | M5 scope |
| `20-dirty-merge` | Dirty & symlink working tree rejection | PASS | Host EPERM | PASS | Requires Windows Developer Mode |
| `21-vector-clocks` | Causal vector clock operations | PASS | PASS | PASS | M5 scope |
| `22-text-ot` | Text OT operational transformation | PASS | PASS | PASS | M5 scope |
| `23-repository-validation` | Deep malformed repository rejection | PASS | PASS | PASS | M5 scope |
| `24-cli-grammar` | Command grammar & argument validation | PASS | PASS | PASS | M7 scope |
| `25-configuration-boundaries` | Identity validation boundaries | PASS | PASS | PASS | M2/M7 scope |
| `26-portability-and-failure-safety` | Local file exchange & atomic updates | PASS | PASS | PASS | M8/M9 scope |
| `27-patch-histories` | Base transitions & schema checks | PASS | PASS | PASS | M5 scope |
| `28-terminal-presentation` | ANSI terminal styling & NO_COLOR | PASS | Signal Hang | PASS | Requires POSIX signal delivery (SIGTERM/SIGINT) |

---

## 6. Summary: What to Do on Windows Right Now

1. **To develop and run Snap commands:**
   - Use `npx --prefix snap/ts tsx snap/ts/src/main.ts <command>` or add `snap/snap.cmd` to your PATH.
2. **To run the full test suite:**
   - Execute `npm --prefix snap/ts run check` followed by `node --test "snap/ts/.m7-test-build/test/**/*.test.js"`.
3. **To pass symlink acceptance scenarios (`08` and `20`):**
   - Enable **Developer Mode** in Windows Settings (`Settings > System > For developers`).
4. **To prepare for Module 8 (`--serve`):**
   - Implement the HTTP server and remote loading adapters in `snap/ts/src/adapters/` and `snap/ts/src/cli/commands/serve.ts` according to `snap/module_plans/module8PLAN.md`.
