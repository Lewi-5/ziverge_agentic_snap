# M2: Configuration and Identity

## Context

`snap/PLAN.md` lays out nine milestones for the TypeScript Snap implementation,
tracked live in `snap/modules.md`. M2 depends on a completed M1. Before starting
M2, confirm that M1 is marked `Complete`, read its handoff note and verification
evidence, and verify that the corrections in `module1planCORRECTIONS.md` have
been incorporated into the shared contracts. In particular, M2 relies on M1's
layered architecture, contributor-ID rules, corrected repository discovery,
strict CLI dispatch, and semantic presentation boundary.

We are now building **M2: Configuration and Identity**. In Snap, commits and
reverts author new patches. Every patch requires an author identified by a
single contributor ID (e.g. `alice@example.com`). M2 establishes the strict
configuration reader and writer, contributor ID validation, local-over-global
lookup precedence, and the CLI `snap config` command.

Getting the configuration contracts right in M2 is critical for the rest of the
project:
1. **Validation boundary**: Configuration bytes from disk are untrusted. M2
   introduces fatal UTF-8 decoding, strict JSON parsing with duplicate-key
   detection, and exact-schema enforcement. The shared UTF-8/JSON layer will be
   reused by M3/M5 for `repository.json`.
2. **Precedence and failure semantics**: Local configuration takes strict
   precedence over global configuration. A corrupt or invalid local configuration
   must block fallback to global configuration, raising an immediate error.
3. **Document replacement**: `snap config` completely replaces the configuration
   file with the exact canonical shape, intentionally stripping prior malformed
   content or unknown keys.
4. **Grammar & silence**: `snap config` enforces strict option positioning and
   emits zero bytes to stdout and stderr on success in both plain and terminal
   modes.

Behavioral authority: `snap/SPEC.md` §§3.1, 4.1, 7.2, 7.11, 8, 10.
Downstream public scenarios that consume M2 behavior:
`snap/tests/03-configuration.yaml`,
`snap/tests/14-cli-errors.yaml`, `snap/tests/19-version-boundaries.yaml`,
`snap/tests/24-cli-grammar-matrix.yaml`, and
`snap/tests/25-config-version-path-boundaries.yaml`.
Per `snap/modules.md`, public scenario 03 is deferred to M3 because it invokes
`commit` to demonstrate precedence in practice; M2's exit gate is verified
through comprehensive internal unit and integration tests.

## Scope

### In scope

- **Strict UTF-8 and JSON decoding**: Read files as bytes, decode UTF-8 with a
  fatal decoder, and pass the resulting text to the pure domain function
  `parseJsonStrict(text)`. The JSON parser rejects duplicate keys at any object
  depth, comparing their decoded key strings so keys such as `"id"` and
  `"\u0069d"` are duplicates. Invalid UTF-8 and invalid JSON are expected
  validation errors.
- **Configuration schema validation & serialization**: Validate exact object shape
  `{"contributor":{"id":"<id>"}}`. Reject any missing field, non-string ID, or
  unknown extra field. Serialize with 2-space indentation and exact trailing LF
  (`JSON.stringify(val, null, 2) + "\n"`).
- **Contributor ID validation**: Enforce ASCII email-like constraints per SPEC
  §3.1 via the existing validator, and introduce a validated `ContributorId`
  domain value or equivalent constructor so application code does not pass an
  unchecked `string` as an author identity.
- **Identity resolution use case** (`resolveContributorId`):
  1. Accept the already-discovered repository root from the authoring use case
     and check its local `.snap/config.json`. Do not rediscover the repository
     inside identity resolution.
  2. If local file exists: read and parse strictly. If valid, return ID (global is
     never read). If invalid (syntax error, duplicate key, unknown field, invalid ID),
     fail immediately (invalid local blocks global).
  3. If local file is absent: check `$HOME/.snapconfig.json`.
  4. If `$HOME` is unset or empty: global configuration is unavailable.
  5. If global file exists: read and parse strictly. If valid, return ID. If invalid,
     fail immediately.
  6. If neither local nor global configuration provides an ID: return expected
     error `snap: contributor.id is required; configure it locally or globally\n`.
- **`snap config` command & use case** (`setConfig`):
  - Strict CLI grammar: `snap config [--global] contributor.id <id>`.
  - Validate contributor ID in-memory before any filesystem read or write.
  - If `--global`: write `$HOME/.snapconfig.json`. Requires `$HOME` to be set; does
    not require a repository.
  - If local (no `--global`): discover nearest repository. If none found, fail with
    `snap: not a Snap repository\n`. Write `<repoRoot>/.snap/config.json`.
  - Replace the target with the exact supported configuration document without
    reading or validating its previous contents, dropping unknown keys or prior
    malformed data. Atomic configuration replacement is not an M2 requirement;
    do not describe a plain `writeFile` call as atomic.
  - Silent on success (exit code 0, empty stdout, empty stderr).
- **Ports & Adapters**:
  - Extend `FileSystemPort` with a byte-returning read operation such as
    `readFileIfExists(path): Promise<Uint8Array | null>`. `null` means only
    `ENOENT`/`ENOTDIR`; permission failures and other I/O errors must throw.
  - Implement the operation in `NodeFileSystemAdapter` with
    `node:fs/promises`, without Node's lossy UTF-8 string decoding.
  - Introduce `EnvironmentPort` (`getEnv(name: string): string | undefined`).
  - Implement `NodeEnvironmentAdapter` reading `process.env`, with an injectable
    environment source for deterministic tests that do not mutate global
    process state.
  - Wire `environment` into `CliPorts` and `main.ts`.

### Out of scope (deferred to later milestones)

- `commit` and `revert` commands (M3 and M6). M2 implements the identity
  resolution use case they will call, but does not implement the commands.
- Working tree scanning, status, diff, log (M3/M4).
- Replay engine, OT, merge (M5/M6).
- ANSI terminal color presentation (M7). `config` remains silent in all modes.
- HTTP remote repositories (M8).

## File layout (`snap/ts/src/`)

```
domain/
  json/
    decode-utf8.ts              [NEW] decodeUtf8Strict(bytes) -> Result<string, DomainError>
    parse-json-strict.ts        [NEW] parseJsonStrict(text) -> Result<unknown, DomainError> (decoded duplicate keys)
  config/
    types.ts                    [NEW] SnapConfiguration, ContributorConfig
    schema.ts                   [NEW] validateConfiguration(obj) -> Result<SnapConfiguration, DomainError>
    serialize.ts                [NEW] serializeConfiguration(config) -> string
  version/
    contributor-id.ts           [MOD] existing validation plus validated ContributorId constructor/value
  errors.ts                     (existing) DomainError, domainError
  result.ts                     (existing) Result, ok, err
ports/
  filesystem-port.ts            [MOD] add byte-returning optional read; null only for missing paths
  environment-port.ts           [NEW] EnvironmentPort { getEnv: (name: string) => string | undefined }
  repository-discovery-port.ts  (existing)
adapters/
  node-filesystem-adapter.ts    [MOD] implement optional byte read using node:fs/promises
  node-environment-adapter.ts   [NEW] createNodeEnvironmentAdapter() implements EnvironmentPort
  node-repository-discovery-adapter.ts (existing)
application/
  config/
    resolve-contributor-id.ts   [NEW] resolveContributorId(repoRoot, ports) -> Result<ContributorId, DomainError>
    set-config.ts               [NEW] setConfig(input, ports) -> Result<void, DomainError>
cli/
  types.ts                      [MOD] CliPorts includes environment: EnvironmentPort
  commands/
    config.ts                   [NEW] configCommand implements Command
  dispatch.ts                   [MOD] register "config" in COMMANDS map
main.ts                         [MOD] instantiate and wire createNodeEnvironmentAdapter()
test/
  strict-utf8.test.ts           [NEW] fatal UTF-8 decoding tests
  json-strict-parse.test.ts     [NEW] tests for parseJsonStrict (duplicate keys, invalid JSON, types)
  config-domain.test.ts         [NEW] tests for validateConfiguration, serializeConfiguration
  node-environment-adapter.test.ts [NEW] tests for environment adapter
  resolve-contributor-id.test.ts   [NEW] tests for resolution precedence & error blocking
  set-config.test.ts            [NEW] tests for setConfig application use case
  cli-config.test.ts            [NEW] tests for config CLI grammar & dispatch
```

### Layering rules

- `domain/**`: Pure functions only. Zero imports from `node:*`, `ports/**`, or
  external modules. Handles fatal UTF-8 decoding, JSON parsing, schema
  validation, contributor ID rules, and serialization.
- `ports/**`: Pure TypeScript interface definitions.
- `adapters/**`: Impure implementations of ports using `node:fs/promises` and
  `process.env`.
- `application/**`: Use cases coordinating domain rules with ports. No CLI
  formatting, no `console.*`, no direct `process.*` access. Always return typed
  `Result<T, DomainError>`.
- `cli/**`: Strict argument grammar parsing, error formatting via
  `formatCliErrorLine`, and exit code mapping.

## Key behaviors

### 1. Strict UTF-8 decoding and duplicate-aware JSON parsing

Standard `JSON.parse` in JavaScript silently overwrites duplicate object keys,
and `fs.readFile(path, "utf8")` replaces malformed byte sequences rather than
rejecting them. `SPEC.md` §§4.1 and 8 and `PLAN.md` §Validation boundary require
untrusted configuration to cross an explicit decoding and validation boundary.

The filesystem adapter returns bytes. `domain/json/decode-utf8.ts` uses a fatal
UTF-8 decoder and returns an expected validation error for malformed input.
Only successfully decoded text is passed to `parseJsonStrict`.

`domain/json/parse-json-strict.ts` provides `parseJsonStrict(text)`:
- Uses a recursive-descent parser, or an equivalently rigorous token scan paired
  with `JSON.parse`, to validate complete JSON grammar and ensure that no object
  at any depth specifies the same decoded key more than once. Duplicate
  comparison occurs after processing JSON string escapes; `"id"` and
  `"\u0069d"` therefore collide.
- Returns `err(domainError("validation", `duplicate JSON key "${key}"`))` if a
  duplicate key is found (matching public test assertion pattern
  `^snap: duplicate JSON key .+\n$`).
- If JSON syntax is invalid, returns `err(domainError("validation", `invalid JSON: ${detail}`))`
  (matching assertion `stderr_contains: invalid JSON`).
- If valid, consumes the entire input and returns the parsed JavaScript value
  wrapped in `ok(...)`.

Duplicate-key diagnostics must safely escape control characters and backslashes
so every rendered error remains exactly one LF-terminated line.

### 2. Exact configuration schema and serialization

Per `SPEC.md` §8, configuration must match exactly:
```json
{
  "contributor": {
    "id": "alice@example.com"
  }
}
```

`domain/config/schema.ts` enforces:
1. Root must be a non-null object, not an array.
2. Root must contain only the `"contributor"` property. Any extra property causes
   an error: `unknown field in configuration: <field>`.
3. `"contributor"` must be a non-null object, not an array.
4. `"contributor"` must contain only the `"id"` property. Any other property is
   rejected as an unknown field.
5. `"id"` must be a string.
6. `"id"` must pass the shared contributor-ID constructor. If not, returns
   `err(domainError("validation", `invalid contributor id: ${id}`))` (matching
   pattern `^snap: invalid contributor id: .+\n$`).

The validated configuration stores a `ContributorId`, not an unchecked string.
Diagnostic interpolation must escape control characters so an invalid ID cannot
turn the required one-line error into multiple lines. Printable IDs such as
`bad-id` retain their displayed spelling.

`domain/config/serialize.ts` produces the canonical representation:
```ts
export function serializeConfiguration(config: SnapConfiguration): string {
  return JSON.stringify(config, null, 2) + "\n";
}
```

### 3. Identity resolution and precedence rules (`resolveContributorId`)

When an authoring command requests the active contributor ID, it passes the
repository root it already discovered and validated:
1. **Local lookup**: Read `<repoRoot>/.snap/config.json` through the optional
   byte-read port.
   - If local config exists: decode it as fatal UTF-8, parse with
     `parseJsonStrict`, then validate with `validateConfiguration`.
     - **Success**: Return `ok(config.contributor.id)`. Global configuration is
       **not** inspected.
     - **Failure**: Return the domain error immediately (e.g. duplicate key,
       syntax error, unknown field, invalid contributor id). **Invalid local
       config strictly blocks global fallback.**
2. **Global fallback**: If local config is absent:
   - Check `$HOME` via `environment.getEnv("HOME")`.
   - If `$HOME` is undefined or empty string, global configuration is unavailable.
     Proceed to missing identity check.
   - If `$HOME` is present, construct `<HOME>/.snapconfig.json`.
   - Read `<HOME>/.snapconfig.json` through the optional byte-read port.
   - If global config exists: decode, parse, and validate it strictly.
     - **Success**: Return `ok(config.contributor.id)`.
     - **Failure**: Return the domain error immediately (e.g. `invalid JSON: ...`).
3. **Missing identity**: If neither local nor global configuration provides a valid
   ID, return:
   ```ts
   err(domainError("validation", "contributor.id is required; configure it locally or globally"))
   ```

Only a genuinely missing file produces fallback or a missing-identity result.
Permission failures, directories in place of files, and other I/O errors must
remain unexpected failures rather than being treated as absent configuration.

### 4. Configuration writer (`snap config`)

Command grammar: `snap config [--global] contributor.id <id>`

1. **Grammar validation**:
   - `args` must match either:
     - `["contributor.id", "<id>"]` (local write)
     - `["--global", "contributor.id", "<id>"]` (global write)
   - Any deviation (misplaced `--global`, duplicate `--global`, unknown option,
     missing `<id>`, extra arguments, key other than `"contributor.id"`) fails
     with:
     `snap: invalid command or arguments\n` (exit code 1).
2. **Validation before mutation**:
   - Parse `<id>` through the shared `ContributorId` constructor before checking
     repository status, environment state, or accessing the filesystem.
   - If invalid, fail immediately with:
     `snap: invalid contributor id: <id>\n` (exit code 1).
3. **Target determination & mutation**:
   - If `--global`:
     - Resolve `$HOME` from `environment.getEnv("HOME")`.
     - If `$HOME` is undefined or empty, fail with:
       `snap: global configuration is unavailable\n` (exit code 1).
     - Target path is `${HOME}/.snapconfig.json`.
   - If local:
     - Discover nearest repository root from `cwd`.
     - If not found, fail with:
       `snap: not a Snap repository\n` (exit code 1).
     - Target path is `${repoRoot}/.snap/config.json`.
   - Serialize `{ contributor: { id } }` with canonical 2-space indentation and LF.
   - Write the serialized document to the target path via
     `fileSystem.writeFile`.
   - **Document replacement**: The write replaces the target file entirely,
     discarding any existing malformed JSON or unknown fields.
4. **Presentation**:
   - Emits nothing to stdout or stderr. Exits with code 0.

## Exact strings / exit codes

| Command / Context | stdout | stderr | exit |
|---|---|---|---|
| `config contributor.id alice@example.com` (in repo) | *(empty)* | *(empty)* | 0 |
| `config --global contributor.id alice@example.com` | *(empty)* | *(empty)* | 0 |
| `config contributor.id alice@example.com` (no repo) | *(empty)* | `snap: not a Snap repository\n` | 1 |
| `config --global contributor.id alice@example.com` (`HOME` unset) | *(empty)* | `snap: global configuration is unavailable\n` | 1 |
| `config contributor.id bad-id` | *(empty)* | `snap: invalid contributor id: bad-id\n` | 1 |
| `config --global contributor.id "two@@x"` | *(empty)* | `snap: invalid contributor id: two@@x\n` | 1 |
| `config` (missing arguments) | *(empty)* | `snap: invalid command or arguments\n` | 1 |
| `config --global contributor.id` (missing value) | *(empty)* | `snap: invalid command or arguments\n` | 1 |
| `config contributor.id a@x --global` (misplaced flag) | *(empty)* | `snap: invalid command or arguments\n` | 1 |
| `config --global --global contributor.id a@x` (duplicate) | *(empty)* | `snap: invalid command or arguments\n` | 1 |
| `config other.key val` (unknown key) | *(empty)* | `snap: invalid command or arguments\n` | 1 |
| Identity resolution: missing local & global ID | *(empty)* | `snap: contributor.id is required; configure it locally or globally\n` | 1 |
| Identity resolution: invalid JSON in selected config | *(empty)* | `snap: invalid JSON: <detail>\n` | 1 |
| Identity resolution: invalid UTF-8 in selected config | *(empty)* | `snap: invalid UTF-8\n` | 1 |
| Identity resolution: duplicate key in selected config | *(empty)* | `snap: duplicate JSON key "<key>"\n` | 1 |
| Identity resolution: unknown field in selected config | *(empty)* | `snap: unknown field in configuration: <field>\n` | 1 |
| Identity resolution: invalid contributor ID in file | *(empty)* | `snap: invalid contributor id: <id>\n` | 1 |
| Unexpected throw | *(empty)* | `snap: <message>\n` | 2 |

## Unit tests to write (Node test runner, `tsx --test`)

### 1. `test/strict-utf8.test.ts` and `test/json-strict-parse.test.ts`
- Valid UTF-8, including non-ASCII JSON string values, decodes without
  normalization.
- Truncated, overlong, surrogate-encoding, and other malformed UTF-8 byte
  sequences fail as expected validation errors rather than producing U+FFFD.
- Valid JSON objects, arrays, primitives, nested structures parse identically to `JSON.parse`.
- Duplicate key at root: `{"a": 1, "a": 2}` -> fails with duplicate JSON key "a".
- Duplicate key nested: `{"contributor": {"id": "a@x", "id": "b@x"}}` -> fails with duplicate JSON key "id".
- Escape-equivalent duplicate: `{"id":"a@x","\u0069d":"b@x"}` -> fails
  with duplicate JSON key "id".
- Duplicate keys inside objects nested in arrays are rejected.
- Invalid JSON syntax: `"not json"`, trailing commas, unclosed braces -> fails with invalid JSON.
- Whitespace handling: arbitrary spaces, tabs, newlines inside valid JSON accepted.

### 2. `test/config-domain.test.ts`
- `validateConfiguration`:
  - accepts exact `{ contributor: { id: "alice@example.com" } }`.
  - rejects non-object root (string, array, null, number, boolean).
  - rejects missing `contributor` key.
  - rejects unknown keys at root: `{ contributor: { id: "a@x" }, unknown: true }`.
  - rejects non-object `contributor` value.
  - rejects missing `id` inside `contributor`.
  - rejects unknown keys inside `contributor`: `{ contributor: { id: "a@x", name: "Alice" } }`.
  - rejects non-string `id`.
  - rejects invalid contributor ID shapes (e.g. `bad-id`, `two@@x`, non-ASCII,
    whitespace, controls, commas, parens, `->`, and 255 bytes); accepts the
    exact 254-byte boundary.
  - preserves contributor ID spelling exactly (case-sensitive).
  - returns a validated `ContributorId`, not an unchecked string.
- `serializeConfiguration`:
  - serializes with two-space indentation and trailing LF.
  - round-trips through `parseJsonStrict` and `validateConfiguration`.

### 3. `test/node-environment-adapter.test.ts`
- Returns variable value when set in environment.
- Returns `undefined` when variable is not set.
- Uses an injected environment record; tests do not modify global `process.env`
  and therefore remain safe under concurrent test execution.

### 4. `test/resolve-contributor-id.test.ts`
- **Precedence**: Local config present and valid -> returns local ID; global config is not read (even if global config is malformed or unreadable).
- **Invalid local blocks global**: Local config contains invalid JSON, duplicate keys, unknown fields, or invalid contributor ID -> fails immediately with exact error; does not fall back to global even if global is valid.
- **Global fallback**: Local config absent, global config present and valid -> returns global ID.
- **Malformed global**: Local config absent, global config malformed -> returns invalid JSON / validation error.
- **Invalid UTF-8**: Invalid local bytes fail without reading global; invalid
  global bytes fail when global is selected.
- **Missing identity**: Neither local nor global config exists -> fails with `snap: contributor.id is required; configure it locally or globally`.
- **Unavailable HOME**: Local config absent, `$HOME` unset/empty -> fails with missing identity error `contributor.id is required; configure it locally or globally`.
- **I/O distinction**: Only `ENOENT`/`ENOTDIR` is treated as missing. Permission
  and other read failures propagate as unexpected errors and never trigger
  global fallback.
- **No duplicate discovery**: Resolution uses the repository root supplied by
  the authoring use case and never invokes repository discovery itself.

### 5. `test/set-config.test.ts`
- **Local config write**:
  - Valid ID and repository present -> writes `<repoRoot>/.snap/config.json`.
  - Verifies exact written content has 2-space indent and trailing LF.
  - Overwrites existing file: replaces file containing unknown fields or malformed JSON with exact valid schema.
  - Does not read or parse the old configuration before replacing it.
  - Outside repository -> fails with `not a Snap repository`, makes zero file write calls.
- **Global config write**:
  - Valid ID and `$HOME` set -> writes `<HOME>/.snapconfig.json`.
  - Does not require a repository root (works outside repositories).
  - Does not invoke repository discovery.
  - `$HOME` unset/empty -> fails with `global configuration is unavailable`, makes zero file write calls.
- **Validation before write**:
  - Invalid contributor ID (`"two@@x"`, `"space @x"`, etc.) -> fails before
    environment lookup or repository discovery and makes zero filesystem write
    calls.

### 6. `test/cli-config.test.ts`
- Grammar checks:
  - `snap config contributor.id a@x` -> exit 0, empty stdout/stderr.
  - `snap config --global contributor.id a@x` -> exit 0, empty stdout/stderr.
  - `snap config --global contributor.id` (missing value) -> exit 1, `snap: invalid command or arguments\n`.
  - `snap config contributor.id a@x --global` (misplaced flag) -> exit 1, `snap: invalid command or arguments\n`.
  - `snap config --global --global contributor.id a@x` (duplicate flag) -> exit 1, `snap: invalid command or arguments\n`.
  - `snap config other.key val` -> exit 1, `snap: invalid command or arguments\n`.
  - `snap config` (no args) -> exit 1, `snap: invalid command or arguments\n`.
  - `snap config contributor.id bad-id` -> exit 1, `snap: invalid contributor id: bad-id\n`.
- Process-level integration through the `snap/ts/snap` executable with real
  Node adapters, isolated temporary working/home directories, and explicit
  stdout, stderr, exit-code, and written-byte assertions.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1 is `Complete` and its corrected shared contracts are present.
   - Set M2 to `In Progress` in `snap/modules.md`, assign the active owner, and
     record the immediate objective before changing implementation files.
1. **Domain: strict UTF-8 and JSON parser**
   - Create `snap/ts/src/domain/json/decode-utf8.ts`.
   - Create `snap/ts/src/domain/json/parse-json-strict.ts`.
   - Write unit tests in `snap/ts/test/strict-utf8.test.ts` and
     `snap/ts/test/json-strict-parse.test.ts`. Verify fatal UTF-8 behavior,
     decoded duplicate-key detection, complete input consumption, and syntax
     error handling.
2. **Domain: configuration schema & serialization**
   - Extend the shared contributor-ID module with an invariant-preserving
     `ContributorId` constructor/value if M1 does not already provide one.
   - Create `snap/ts/src/domain/config/types.ts`, `schema.ts`, `serialize.ts`.
   - Write unit tests in `snap/ts/test/config-domain.test.ts`.
3. **Ports & Adapters: filesystem and environment**
   - Add the optional byte-read operation to `ports/filesystem-port.ts`.
   - Implement it in `adapters/node-filesystem-adapter.ts`, mapping only
     `ENOENT`/`ENOTDIR` to `null`.
   - Create `ports/environment-port.ts`.
   - Create `adapters/node-environment-adapter.ts`.
   - Write unit tests for adapters.
4. **Application: set-config and resolve-contributor-id**
   - Create `application/config/set-config.ts`.
   - Create `application/config/resolve-contributor-id.ts`.
   - Write comprehensive tests in `test/set-config.test.ts` and
     `test/resolve-contributor-id.test.ts`.
5. **CLI & Presentation: config command and dispatch wiring**
   - Update `cli/types.ts` to include `environment` in `CliPorts`.
   - Create `cli/commands/config.ts`.
   - Register `config` in `cli/dispatch.ts`.
   - Update `main.ts` to instantiate `createNodeEnvironmentAdapter()`.
   - Write CLI grammar and end-to-end tests in `test/cli-config.test.ts`.
6. **Completion and handoff**:
   - Record implemented behavior, exact verification results, and the handoff
     note in `snap/modules.md`.
   - Mark M2 `Complete` only after every internal gate and the M1 regression
     checks pass.

Commit after completing each layer, following repository guidance in `snap/AGENTS.md`.

## Verification

Run all required checks from repository root:

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 01-init
./snap/verify --lang ts --filter 02-init-paths
```

Confirm that:
1. TypeScript compiles cleanly with zero errors (`tsc --noEmit`).
2. ESLint passes with zero warnings.
3. All internal unit, integration, and precedence tests pass.
4. M1's public initialization scenarios still pass after the shared filesystem,
   CLI-port, and `main.ts` changes.
5. M2 exit gate in `snap/modules.md` is met before marking M2 `Complete`.

Scenarios 03, 14, 19, 24, and 25 are downstream integration gates rather than
M2 completion gates because they also invoke commands assigned to later
modules. M2's process-level internal tests must therefore exercise the complete
`config` command behavior rather than claiming a partial public scenario pass.
