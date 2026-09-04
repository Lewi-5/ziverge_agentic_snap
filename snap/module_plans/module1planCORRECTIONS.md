# Module 1 Plan Corrections

These corrections supplement `module1PLAN.md`. They do not change Module 1's
scope, dependency order, or exit gate. Their purpose is to keep the M1
foundations consistent with `SPEC.md`, `PLAN.md`, and the public acceptance
suite so later modules can extend them without replacing foundational
contracts.

## 1. Discover repositories by `repository.json` from the target path

Replace the description of repository discovery as walking from `cwd` looking
for `.snap/` with the following contract:

- `RepositoryDiscoveryPort.findRepositoryRoot(startDirectory)` accepts an
  explicit absolute starting directory.
- A directory is a repository root when it contains
  `.snap/repository.json`; the presence of a bare `.snap/` directory is not by
  itself sufficient.
- Discovery walks from `startDirectory` through its ancestors to the
  filesystem root without following symlinks.
- For `init [path]`, resolve the operand against the process working directory
  first, then run discovery from the resolved target. If the target does not
  exist, discovery must still inspect its nearest existing ancestor and every
  ancestor above it.
- If discovery returns the target, report `repository already exists`. If it
  returns an ancestor of the target, report
  `cannot initialize inside repository`.
- All discovery reads complete before the first initialization write.

This is necessary to reject a command such as `snap init repo/new/child` when
it is launched outside `repo` but the resolved target is inside that existing
repository.

Add discovery tests for:

- `.snap/repository.json` at the starting directory;
- `.snap/repository.json` at an ancestor;
- a bare `.snap/` directory without `repository.json`;
- a missing target whose existing ancestor is a repository;
- no repository through the filesystem root; and
- termination at the filesystem root.

## 2. Make the initial CLI grammar canonical

The M1 dispatcher should establish the grammar contract that later commands
extend:

- `--version` succeeds only when the complete argument vector is exactly
  `['--version']`. It must still return without repository discovery or other
  filesystem access.
- `init` accepts zero or one path operand.
- `init a b`, `init --unknown`, and `--version extra` are grammar errors and
  must not invoke an application use case or mutate the filesystem.
- Unknown commands, missing commands, unknown options, and invalid argument
  shapes should use the shared plain diagnostic
  `snap: invalid command or arguments\n`, stdout empty, and exit code 1. Do not
  introduce M1-specific diagnostics that public scenarios require M7 to
  replace.
- Unexpected exceptions remain centralized at the outer CLI boundary and map
  to exit code 2. Expected grammar and domain failures map to exit code 1.

Update the exact-output table and CLI unit tests in `module1PLAN.md` to match
these rules.

## 3. Emit the recommended repository JSON form

The empty repository value remains:

```json
{
  "format": 1,
  "frontier": [],
  "patches": []
}
```

The writer should serialize with two-space indentation and append exactly one
LF, equivalent to `JSON.stringify(value, null, 2) + '\n'`. Readers will later
accept ordinary JSON whitespace and object-key order, but writers should emit
the stable, inspectable representation recommended by `SPEC.md` section 4.1.

The M1 integration test should verify the exact bytes as well as parsed JSON
equality.

## 4. Establish the semantic presentation boundary in M1

Do not make command handlers construct final stdout or stderr strings. Add a
minimal presentation seam now, even though ANSI terminal presentation remains
deferred to M7:

- Application use cases return typed domain results or typed expected errors.
- CLI command handlers return semantic output records such as an initialized
  repository result containing a version.
- A dedicated plain renderer converts semantic results and errors into exact
  LF-terminated output.
- `main.ts` alone writes rendered bytes to stdout and stderr and assigns the
  exit code.

The file layout may add a small `presentation/` area or an equivalent renderer
interface under `cli/`. The important invariant is that M7 can add a terminal
renderer without changing application use cases or command semantics.

## 5. Make version invariants explicit at construction boundaries

Strengthen the version portion of the plan as follows:

- Contributor IDs must be ASCII, contain exactly one `@` with nonempty text on
  both sides, preserve spelling, exclude every prohibited character or
  substring, and contain at most 254 bytes.
- Revisions are integers from 1 through `Number.MAX_SAFE_INTEGER`, inclusive.
- Untrusted component arrays must pass through one validating/canonicalizing
  constructor. Public APIs must not permit duplicate IDs, zero revisions,
  unsafe revisions, or noncanonical component order to enter a `Version`.
- `EMPTY_VERSION` and constructed versions should be immutable.
- Formatting, causal comparison, join, and Snap order consume valid `Version`
  values. Parsing and join must produce canonical values using the single
  unsigned UTF-8 comparator.
- Causal comparison must preserve the four distinct results: equal, before,
  after, and concurrent.

Extend the unit-test list with:

- non-ASCII contributor IDs rejected;
- exactly 254 bytes accepted and 255 bytes rejected;
- revision `Number.MAX_SAFE_INTEGER` accepted and the next integer rejected;
- no public construction path for duplicate, zero, unsafe, or unsorted
  components; and
- immutability/non-mutation checks for join and sorting helpers.

## 6. Do not publish placeholder repository decoders

Change the `domain/repository/document.ts` description so M1 implements only
the repository functionality it genuinely supports: the empty repository
value and its canonical encoder.

Do not export a stubbed or partially validating decoder. Full untrusted JSON
decoding and repository validation belong to M3/M5 and should be added when
their complete contracts and tests are implemented. This avoids later code
mistaking an incomplete decoder for a validation boundary.

## 7. Clarify mutation assertions and integration-test hygiene

Revise the init test language from "zero filesystem calls" to "zero mutation
calls" or "zero write calls" on rejected initialization. Repository discovery
must perform filesystem reads, but a validation or expected-domain failure
must perform no `mkdir`, file write, rename, or removal.

For real-filesystem adapter tests:

- create an isolated temporary directory;
- register cleanup before executing assertions;
- test discovery and initialization through the same Node adapters used by
  `main.ts`;
- verify existing working files remain byte-identical; and
- verify rejection inside an existing repository leaves the proposed target
  without a newly created `.snap/` directory.

## Revised M1 completion check

M1 is complete only when the original exit gate and these corrections are both
satisfied:

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 01-init
./snap/verify --lang ts --filter 02-init-paths
```

Before marking M1 complete in `modules.md`, record the exact commands and their
results. Scenario 21 remains deferred to M6, and the full CLI grammar and
terminal presentation scenarios remain M7/M8 gates; M1 should nevertheless
leave extension points and current command behavior consistent with those
later requirements.
