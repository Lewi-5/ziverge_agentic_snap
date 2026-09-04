# M1: Foundations, Clock Algebra, CLI Shell, and Init

## Context

`snap/PLAN.md` lays out nine milestones for the TypeScript Snap implementation,
tracked live in `snap/modules.md`. Nothing has been implemented yet — `snap/ts/`
is a bare scaffold (stub `main.ts` printing "not implemented", a sanity-check
test). We're building the first module, **M1**, which establishes the layered
architecture (pure domain engine / ports / Node adapters / application use
cases / CLI+presentation) that every later milestone builds on, plus the one
command M1 must deliver end-to-end: `snap init`.

Getting the architecture boundaries and the version/vector-clock algebra right
here matters disproportionately: `PLAN.md` requires exactly one implementation
of each canonical operation (unsigned UTF-8 ordering, version comparison,
version formatting) for the whole project, and every later command (config,
commit, merge, diff, HTTP, color) plugs into the CLI dispatch and discovery
adapter built in this module without restructuring them.

Behavioral authority: `snap/SPEC.md` §§1–3, 7.1, 7.10, 10. Public exit gate:
`snap/tests/01-init.yaml` and `snap/tests/02-init-paths.yaml`. Scenario 21
(version algebra) is explicitly deferred to M6 since it also needs
commit/merge/diff — we only need its underlying algebra to be internally
unit-tested now.

## Scope

In scope: domain error/result types, unsigned UTF-8 ordering, version parse/
format/compare/join/Snap-order, repository-discovery port+adapter, `init` use
case, minimal strict CLI dispatch (`init`, `--version`, unknown/missing
command handling), plain stdout/stderr + exit-code rendering, `main.ts` wiring.

Out of scope (later milestones): config/identity (M2), working-tree scan/diff/
commit/status/log (M3/M4), replay/OT/merge/revert (M5/M6), terminal color
(M7), HTTP (M8).

## File layout (`snap/ts/src/`)

```
domain/
  result.ts                    Result<T,E> ok()/err()
  errors.ts                    DomainError, ErrorCategory, domainError()
  unsigned-utf8.ts              compareUnsignedUtf8, sortByUnsignedUtf8 — SINGLE impl, reused by path sort in M3
  version/
    types.ts                   VersionComponent, Version, EMPTY_VERSION
    contributor-id.ts          isValidContributorId (SPEC §3.1)
    parse.ts                   parseVersion(text) -> Result<Version, DomainError>
    format.ts                  formatVersion(v) -> string
    compare.ts                 compareCausal, joinVersions
    snap-order.ts              compareSnapOrder
  repository/
    document.ts                RepositoryDocumentV1, emptyRepositoryDocument, encodeRepositoryDocument
                                (decode/validate stubbed for M3/M5, not implemented now)
ports/
  filesystem-port.ts           FileSystemPort interface
  repository-discovery-port.ts RepositoryDiscoveryPort interface
adapters/
  node-filesystem-adapter.ts
  node-repository-discovery-adapter.ts   walks cwd -> root looking for .snap/
application/
  paths.ts                     resolveOperandPath(cwd, operand)
  init-repository.ts           initRepository(input, ports) — prepare/apply, no printing
cli/
  types.ts                     CliContext, CliPorts, CommandOutput, CliOutcome
  exit-codes.ts                EXIT_SUCCESS/EXPECTED_ERROR/UNEXPECTED_ERROR = 0/1/2
  errors.ts                    formatCliErrorLine, unexpectedErrorDetail
  version.ts                   SNAP_VERSION from package.json
  commands/
    command.ts                 Command type — shape every future command implements
    version.ts                 versionCommand
    init.ts                    initCommand (thin grammar + calls application/init-repository)
  dispatch.ts                  runCli(context) -> CliOutcome; --version short-circuits repo discovery
main.ts                        wires Node adapters, calls runCli, writes streams, sets exitCode
test/
  unsigned-utf8.test.ts
  version-parse-format.test.ts
  version-compare-join.test.ts
  version-snap-order.test.ts
  node-repository-discovery-adapter.test.ts
  init-repository.test.ts
  cli-dispatch.test.ts
  sample.test.ts               (existing, unchanged)
```

Layering rule: `domain/**` has zero imports from `node:*` or any I/O — pure
functions/types only. `ports/**` are interfaces. `adapters/**` implement ports
with `node:fs/promises`, `node:path`. `application/**` orchestrate domain +
ports, return `Result` values, never call `console.*`. `cli/**` + `main.ts` do
all argv parsing, stdout/stderr writing, and exit-code setting.

## Key behaviors

- **`init [path]`** (`application/init-repository.ts`): resolve absolute
  target path; use `RepositoryDiscoveryPort.findRepositoryRoot` to check
  before any write. If the found root equals the target itself → error
  `repository already exists`. If it's an ancestor → error `cannot initialize
  inside repository`. Otherwise create the directory (recursive), `.snap/`,
  and `.snap/repository.json` containing `{"format":1,"frontier":[],"patches":[]}`
  (LF-terminated), then return the empty version. No filesystem write happens
  before the discovery check completes (prepare/apply, matching PLAN.md's
  mutation model even though M1 has no rollback risk).
- **CLI dispatch** (`cli/dispatch.ts`): `--version` is checked first and
  returns `snap <version>\n` without touching ports/discovery at all (SPEC
  §7.10: works without locating a repository). Otherwise: empty argv →
  expected error `missing command`; unknown first token → expected error
  `unknown command '<x>'`; known command → run handler, map `Result` to exit
  0/1, `stdout`/`stderr` accordingly. Uncaught throws from adapters are caught
  once at the top and mapped to exit 2 with `snap: <message>`.
- **Version algebra** (`domain/version/*`): canonical syntax and every
  documented error per SPEC §3.1–3.2 (duplicate id, explicit zero, leading
  zero, overflow past `Number.MAX_SAFE_INTEGER`, invalid id shape, whitespace,
  noncanonical order); 4-way causal comparison and componentwise join per
  §3.3; Snap order per §3.4. All ordering goes through the one
  `compareUnsignedUtf8` primitive.

## Exact strings / exit codes

| Case | stdout | stderr | exit |
|---|---|---|---|
| `init` success | `()\n` | *(empty)* | 0 |
| `init`, already initialized | *(empty)* | `snap: repository already exists\n` | 1 |
| `init`, inside existing repo | *(empty)* | `snap: cannot initialize inside repository\n` | 1 |
| `--version` | `snap <SNAP_VERSION>\n` | *(empty)* | 0 |
| no argv | *(empty)* | `snap: missing command\n` | 1 |
| unknown command `<x>` | *(empty)* | `snap: unknown command '<x>'\n` | 1 |
| unexpected throw | *(empty)* | `snap: <message>\n` | 2 |

The two `init` error substrings match `stderr_contains` assertions in
`snap/tests/02-init-paths.yaml` exactly.

## Unit tests to write (Node test runner, `tsx --test`)

- **unsigned-utf8**: ASCII order/prefix rule, case sensitivity, accented vs
  ASCII, emoji (surrogate pair) ordering, trailing-space prefix case.
- **version parse/format**: round trips both directions; revision boundary at
  `9007199254740991` vs overflow; one failing case each for duplicate id,
  explicit `->0`, leading zero, every invalid-contributor-id shape (no `@`,
  two `@`, empty local/domain part, control char, `,`/`(`/`)`, `->` substring,
  >254 bytes), embedded whitespace, noncanonical order, malformed syntax.
- **version compare/join**: equal/before/after/concurrent incl. disjoint
  contributor sets; join idempotent/commutative/associative; join result
  stays canonically sorted.
- **Snap order**: tie-breaking example; consistency with causal order
  (before ⇒ snap-order negative) across a small fixed set.
- **repository discovery adapter**: fake `FileSystemPort` — found at start
  dir, found at ancestor, not found (null), stops at filesystem root; plus one
  real-`fs` integration test using `node:os.tmpdir()`.
- **init use case**: fake ports — success creates dir/`.snap`/`repository.json`
  with correct content and returns empty version; both error paths make zero
  filesystem calls (proves validation-before-write); nested new path
  (`new/repository`) succeeds.
- **cli dispatch**: `--version` works even when ports throw (proves no
  discovery happens); unknown/missing command exact stderr; `init` success and
  both failure paths through `runCli`; a thrown `Error` from a handler maps to
  exit 2 with its message.

## Order of implementation

1. `domain/result.ts`, `domain/errors.ts`, `domain/unsigned-utf8.ts` + tests.
2. `domain/version/*` (types, contributor-id, parse, format, compare,
   snap-order) + tests.
3. `domain/repository/document.ts`.
4. `ports/*` interfaces.
5. `adapters/node-filesystem-adapter.ts`.
6. `adapters/node-repository-discovery-adapter.ts` + tests.
7. `application/paths.ts`, `application/init-repository.ts` + tests.
8. `cli/*` (types, exit-codes, errors, version, commands/*, dispatch) + tests.
9. `main.ts` wiring, replacing the stub.

Commit after each completed layer (per `snap/AGENTS.md`), not after every file.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 01-init
./snap/verify --lang ts --filter 02-init-paths
```

All four must pass — strict build clean, lint clean with zero warnings, all
`node:test` cases green, both public scenarios pass — before marking M1
`Complete` in `snap/modules.md` (owner, status, verification evidence, handoff
note per the tracker's rules).
