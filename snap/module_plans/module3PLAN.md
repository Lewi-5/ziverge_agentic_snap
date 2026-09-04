# M3: Working Tree and Linear History

## Context

`snap/PLAN.md` defines nine milestones and `snap/modules.md` is the only live
progress ledger. M3 starts only after M1, M2, and M4 are complete. Read their
handoff notes before implementation: M3 composes M1's version/CLI foundations,
M2's strict JSON and identity boundary, and M4's tree/content/diff algebra into
the first useful linear-history workflow.

We are building **M3: Working Tree and Linear History**. This module adds
repository loading for histories Snap itself writes, byte-exact working-tree
scanning, `status`, `commit`, `log`, and both working-tree and local historical
`diff`. It also establishes the metadata publication path later reused by
`merge` and `revert`.

The important boundary is that M3 may stage repository validation, but it must
not label a partially checked value as fully validated. M3 owns complete JSON
schema decoding and all semantics needed for generated linear histories. M5
adds arbitrary causal-graph closure validation, exact-base validation across
concurrency, replay/OT, and the final `ValidatedRepository` constructor. No
command may bypass the strongest validator available at its milestone.

Behavioral authority: `snap/SPEC.md` §§1–5, 7.3–7.6, 8, and 10. Public exit
gate: scenarios 03, 04, 05, 06, 08, and 25. Relevant malformed-history cases
from scenario 15 receive internal coverage here; scenarios 15, 23, and 27 close
only in M5.

## Scope

### In scope

- Load `.snap/repository.json` as bytes, decode fatal UTF-8, parse duplicate-aware
  JSON, and enforce the exact repository/patch/change schemas used by linear
  histories.
- Scan the working tree as an immutable path-to-bytes map, excluding only the
  root `.snap/` metadata subtree, ignoring empty directories, and rejecting
  every symlink or non-regular entry without following it.
- Validate and canonicalize tracked paths, maintain prefix-free trees, compare
  trees byte-for-byte, and classify `A`, `M`, and `D` rows in unsigned UTF-8
  path order.
- Materialize generated linear histories from the empty tree and expose a
  distinct, honestly named linear-history validation result. M5 replaces this
  command boundary with full causal validation before arbitrary histories are
  accepted.
- Implement `status`, `commit`, `log`, and `diff` with no arguments or two local
  version arguments.
- Construct patches from the complete current tree to the complete working
  tree using M4's single canonical comparison/change-selection implementation.
- Atomically publish `repository.json` from a same-directory temporary file.
- Return semantic command results; extend the plain renderer without embedding
  output strings in application use cases.

### Out of scope

- Concurrent histories, arbitrary causal replay, OT, namespace/path conflict
  resolution, and full repository graph validation (M5).
- `merge`, `revert`, local cross-repository `diff --repo`, patch-set union, and
  safe working-tree materialization (M6).
- Final all-command grammar hardening and ANSI presentation (M7).
- HTTP repository sources and serving (M8).

## File layout (`snap/ts/src/`)

```text
domain/
  repository/
    types.ts                         [NEW] typed patch/change/repository shapes
    schema.ts                        [NEW] exact untrusted JSON shape decoder
    serialize.ts                     [NEW] canonical repository encoder
    linear-history.ts                [NEW] generated-linear validation/materialization
    patch.ts                         [NEW] patch result/dot helpers and construction
  tree/
    types.ts                         [NEW] immutable FileTree/FileContent values
    path.ts                          [NEW] tracked-path validation and prefix checks
    compare.ts                       [NEW] equality and A/M/D tree delta
    construct.ts                     [NEW] validated, sorted, prefix-free tree constructor
application/
  repository/
    load-local-repository.ts         [NEW] discovery, byte load, decode, staged validation
    publish-repository.ts            [NEW] temp-write/flush/close/atomic replace
  working-tree/
    read-working-tree.ts             [NEW] scanner-port orchestration
  commands/
    status.ts                        [NEW]
    commit.ts                        [NEW]
    log.ts                           [NEW]
    diff.ts                          [NEW] working/local-history forms only
ports/
  filesystem-port.ts                [MOD] byte reads, lstat/readdir, atomic-file operations
  working-tree-port.ts               [NEW] scan repository root into typed entries/bytes
adapters/
  node-filesystem-adapter.ts         [MOD] binary-safe metadata and atomic replacement
  node-working-tree-adapter.ts       [NEW] non-following, byte-aware recursive scan
cli/
  results.ts                         [MOD] status/log/diff/commit semantic records
  render.ts                          [MOD] exact plain rendering
  commands/status.ts                 [NEW]
  commands/commit.ts                 [NEW]
  commands/log.ts                    [NEW]
  commands/diff.ts                   [NEW]
  dispatch.ts                        [MOD] register commands
test/
  tree-path.test.ts
  tree-compare.test.ts
  repository-schema-linear.test.ts
  node-working-tree-adapter.test.ts
  repository-publication.test.ts
  status-command.test.ts
  commit-command.test.ts
  log-command.test.ts
  diff-command.test.ts
```

Names may be adjusted to the established codebase, but the responsibility
boundaries must remain explicit. In particular, filesystem traversal does not
decide domain path order, and CLI rendering does not construct patches.

## Layering rules

- `domain/**` is pure and imports no `node:*`, ports, environment, or CLI code.
- Untrusted JSON crosses duplicate-aware parsing, exact schema decoding, and the
  current semantic validator in that order. A decoded document is not a
  validated repository.
- `application/**` discovers once, coordinates ports and pure operations, and
  returns typed results/errors. It never writes stdout/stderr.
- Adapters return bytes and entry kinds; domain/application code owns Snap's
  tracked-path and tree invariants.
- M4's tokenizer, canonical diff, edit application, base64 codec, and change
  selection are reused. M3 must not introduce a second line splitter or diff.
- Repository and tree collections use the one unsigned UTF-8 comparator from M1.

## Key behaviors

### 1. Working-tree scanning

Start at the discovered repository root and recursively inspect entries without
following symlinks. Skip the root `.snap` directory and all descendants. A
nested path such as `docs/.snap/file` is ordinary tracked content because only
the first path segment is reserved.

Use byte-aware directory APIs where the platform supports non-UTF-8 names so an
invalid filename is rejected instead of replacement-decoded. Convert accepted
relative paths to `/` separators for domain use; use platform path APIs only for
disk access. Validate every path and sort with `compareUnsignedUtf8`.

Regular files are read as bytes. Directories contribute no tree entry and empty
directories are ignored. A symlink, FIFO, socket, device, or any other
non-regular entry fails with:

```text
snap: unsupported working tree entry: <path>
```

The scan must not follow the entry. Status, working `diff`, and `commit` all use
this same scanner.

### 2. Repository decoding and linear validation

Replace M1's empty-document-only shape with exact discriminated domain types.
Decoding rejects duplicate keys, unknown/missing fields, wrong primitive types,
non-integer/unsafe numbers, invalid contributor IDs, versions, messages, paths,
base64, tokens, and edit operations. Version arrays in repository JSON are
canonical ordered arrays: IDs are unique, nonzero revisions are safe integers,
and components are in unsigned UTF-8 order. This is required by public scenario
23 even though JSON object-key order and whitespace remain irrelevant.

M3's semantic validator accepts the empty repository and the serial histories
produced by `commit`: patches are sorted author then numeric revision, dots are
unique and contiguous, bases/results form one linear frontier, changes are
sorted by path, and each change applies exactly to the preceding materialized
tree. It rejects under/over-consuming edits, invalid create/edit/delete
preconditions, no-op changes, and non-prefix-free authored results.

Keep the type name distinct from M5's final arbitrary causal
`ValidatedRepository`. Do not export an unchecked cast or fallback parser.

### 3. Status

Discover/load the nearest repository, materialize its current frontier, scan the
working tree, and compare exact path/byte maps. Plain output is:

```text
version <frontier>
A <added-path>
M <modified-path>
D <deleted-path>
```

Rows sort by unsigned UTF-8 path bytes regardless of status code. A clean tree
prints only the version line. Empty directories and root metadata changes do not
make the tree dirty.

### 4. Commit

Grammar at this milestone accepts exactly one message operand. Preserve it
verbatim: do not trim, normalize newlines, or discard trailing spaces. The
message must be nonempty UTF-8, contain no ASCII control other than tab/LF, and
be at most 4096 UTF-8 bytes. Invalid input fails with `invalid commit message`.

After discovery and repository validation, resolve identity through M2, scan the
working tree, and compute the complete delta against the current tree. A clean
tree fails with:

```text
snap: working tree is clean
```

For each sorted changed path, M4 selects exactly:

- `delete` when the new path is absent;
- `text` when new bytes are text and old bytes are absent or text; or
- `put` otherwise.

The new patch base is the current frontier. Its revision is
`base[author] + 1`; fail on safe-integer overflow or a dot collision. Changes
are nonempty and sorted. Append the patch, sort the repository by author then
revision, advance only the author's frontier component, validate the prepared
document, and atomically replace metadata. The working tree is already the
target and must not be rewritten. Print the new version.

### 5. Atomic repository publication

Canonical serialization uses two-space indentation and exactly one final LF.
Write bytes to a unique temporary file inside the same `.snap/` directory,
flush and close it, then atomically replace `repository.json`. Clean up an
unpublished temporary file on ordinary failures when safe. Never delete or
replace the old metadata before the new file is fully written and closed.

### 6. Log

Use the same canonical integration order that linear materialization uses and
reverse it. Each plain record is:

```text
<patch-result-version>\t<author>\t<escaped-message>
```

Escape message characters in this exact order: backslash to `\\`, tab to
`\t`, then LF to `\n`. There is one LF per record, no blank line, and an empty
history produces no output. Never use storage-array order as an independent
history-order implementation.

### 7. Diff

M3 supports these forms:

```text
snap diff
snap diff <old> <new>
```

The zero-argument form compares current materialized tree with the scanned
working tree and therefore rejects unsupported entries. The two-version form
strictly parses canonical CLI versions, proves both are locally known, and
materializes each. Unknown versions fail as `unknown version: <version>`.

Tree comparison and M4's semantic diff records drive output. Paths sort by
unsigned UTF-8 bytes; text blocks, binary notices, `/dev/null`, and no-final-LF
markers follow the spec byte-for-byte. Equal trees produce zero stdout and
success. `--repo` is added for local repositories in M6 and HTTP in M8; M7 owns
the final usage grammar and diagnostic.

## Exact plain outputs and failures

| Case | stdout | stderr | exit |
| --- | --- | --- | --- |
| clean `status` | `version <V>\n` | empty | 0 |
| dirty `status` | version line plus sorted `A/M/D` rows | empty | 0 |
| `commit` success | `<new-version>\n` | empty | 0 |
| clean `commit` | empty | `snap: working tree is clean\n` | 1 |
| invalid/empty message | empty | `snap: invalid commit message\n` | 1 |
| empty `log` | empty | empty | 0 |
| `diff` with no changes | empty | empty | 0 |
| unknown historical version | empty | `snap: unknown version: <V>\n` | 1 |
| unsupported entry | empty | `snap: unsupported working tree entry: <path>\n` | 1 |

Unexpected adapter failures continue to use exit 2. All validation failures
occur before metadata mutation.

## Tests to write

### Domain and repository tests

- Path validation: controls, backslash, empty/`.`/`..` segments, root `.snap`,
  Unicode spelling preservation, prefix conflicts, and unsigned UTF-8 order.
- Immutable tree construction, byte equality, sorted `A/M/D` deltas, and no
  mutation of input buffers/collections.
- Exact repository/change schema, canonical version arrays, patch/change sort,
  base64, messages, token shapes, edit completeness, and generated-linear
  round trips.
- Patch construction for create/edit/delete, text-to-binary, binary-to-text,
  binary replacement, empty file creation, and revision overflow.

### Adapter and application tests

- Scanner excludes only root `.snap`, ignores empty directories, preserves
  CRLF/Unicode/NUL bytes, emits `/` paths, and rejects symlink/FIFO/special
  entries without following them.
- Atomic publication writes/flushed/closes before rename and leaves the old
  metadata intact when preparation or temporary writing fails.
- Status clean/dirty cases and path ordering.
- Commit local/global identity precedence, malformed selected configuration,
  clean-tree rejection, exact messages including tab/LF/backslash/trailing
  space, 4096-byte boundary, and canonical repository bytes.
- Log reverse order and escape order.
- Working and historical diff integration, invalid and unknown versions, empty
  output, binary files, empty text, repeated lines, CRLF, Unicode, and missing
  final LF.
- Process-level tests use real adapters in isolated temporary directories and
  assert stdout, stderr, exit code, repository JSON, and file bytes.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1, M2, and M4 are `Complete`; read exact handoffs.
   - Set M3 `In Progress`, assign the owner, and record the immediate objective
     in `snap/modules.md` before implementation changes.
1. **Tree domain**
   - Add validated tracked paths, immutable prefix-free trees, byte equality,
     and canonical deltas with unit tests.
2. **Repository schema and generated-linear validator**
   - Add exact typed decoding/serialization and the explicitly staged linear
     validator/materializer. Cover malformed linear repositories internally.
3. **Filesystem boundaries**
   - Extend filesystem ports, add the non-following scanner, and add
     same-directory atomic metadata publication with adapter tests.
4. **Read-only commands**
   - Implement repository loading, status, local materialization, log, and both
     M3 diff forms using semantic CLI results.
5. **Commit**
   - Integrate M2 identity and M4 change construction; prepare and validate the
     complete new document before atomic publication.
6. **CLI and process integration**
   - Register commands, extend the plain renderer, and add exact process tests.
7. **Completion and handoff**
   - Run every gate, record exact results and remaining M5 validation work, and
     mark complete only after the full exit gate passes.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 03-configuration
./snap/verify --lang ts --filter 04-commit-status-log
./snap/verify --lang ts --filter 05-diff-goldens
./snap/verify --lang ts --filter 06-binary-and-empty
./snap/verify --lang ts --filter 08-unsupported-entries
./snap/verify --lang ts --filter 25-config-version-path-boundaries
```

All commands must pass before M3 is marked `Complete`. Record focused internal
coverage for M3-owned portions of scenario 15, but do not claim scenarios 15,
23, or 27 until M5's full arbitrary-history validator and replay gate pass.
