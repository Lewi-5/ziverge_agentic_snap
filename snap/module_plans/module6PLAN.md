# M6: Merge and Revert

## Context

`snap/PLAN.md` makes M6 the mutation/integration milestone. It depends on M2
through M5: identity, tree scanning and linear commands, canonical content
algebra, and the fully validated replay engine must all be complete before M6
starts. Read every dependency handoff and confirm all repository sources now
produce the same opaque `ValidatedRepository` value.

We are building **M6: Merge and Revert**. M6 adds patch-set union and frontier
join, local repository operands, cross-repository collision checks, net-new
merge warnings, additive revert patches, and safe materialization of target
trees. It also completes the local `diff ... --repo` form required to detect
same-dot corruption without importing anything.

The module's central safety rule is prepare before apply. Local and operand
repositories, requested versions, replay results, dot identity, cleanliness,
warning sets, target trees, and the final repository document are all resolved
before the first mutation. For merge/revert, working bytes are updated first;
metadata is atomically published only after that succeeds.

Behavioral authority: `snap/SPEC.md` §§1, 3.3–3.5, 4.1–4.2, 6, 7.6–7.8, 8,
and 10. Public exit gate: scenarios 07, 09, 10, 11, and 16 through 22.

## Scope

### In scope

- Resolve non-HTTP repository operands as local paths relative to process cwd
  and load the operand's root `.snap/repository.json` through M5 validation.
- Compare common dots by parsed typed patch value and report collisions before
  output or mutation.
- Union equal patch values, sort the resulting patch set, and componentwise
  join frontiers.
- Compute local and joined replay warnings and emit only the sorted net-new set.
- Implement clean-tree, idempotent local merge without contributor identity or
  merge patches.
- Implement locally known target resolution and additive revert patch authoring.
- Materialize exact target path/byte maps across file/directory transitions and
  prune empty directories.
- Preserve old metadata if working-tree application fails; publish new metadata
  through M3's same-directory atomic writer only after tree application.
- Add local cross-repository historical diff with full collision checks and no
  import/mutation.
- Wire `merge`, `revert`, and the local `diff --repo` form into semantic CLI
  results and plain rendering.

### Out of scope

- HTTP repository operands (M8); M6 defines a repository-source port/interface
  that M8 extends without changing merge/diff semantics.
- Final grammar matrix, ANSI output, and color policy (M7).
- Rollback of partially written working trees, process locking, crash recovery,
  and durability beyond the specified flush/rename boundary.

## File layout (`snap/ts/src/`)

```text
domain/
  repository/
    union.ts                         [NEW] collision-safe typed patch union
    structural-equality.ts           [MOD] shared by merge and cross-repo diff
  history/
    warning-difference.ts            [NEW] joined minus pre-merge facts
  tree/
    mutation-plan.ts                 [NEW] deterministic current-to-target plan
application/
  repository/
    source.ts                        [NEW] local/remote-neutral source contract
    load-local-operand.ts            [NEW] exact local repository-root loader
  commands/
    merge.ts                         [NEW]
    revert.ts                        [NEW]
    diff.ts                          [MOD] add local cross-repository form
ports/
  tree-materialization-port.ts       [NEW] apply prepared file-tree transition
adapters/
  node-tree-materialization-adapter.ts [NEW]
cli/
  results.ts                         [MOD] merged/reverted results + warning facts
  render.ts                          [MOD] plain success/warning output
  commands/merge.ts                  [NEW]
  commands/revert.ts                 [NEW]
  commands/diff.ts                   [MOD] recognize local `--repo` form
  dispatch.ts                        [MOD]
test/
  repository-union.test.ts
  warning-difference.test.ts
  tree-mutation-plan.test.ts
  node-tree-materialization-adapter.test.ts
  merge-command.test.ts
  revert-command.test.ts
  cross-repository-diff.test.ts
  mutation-failure.test.ts
```

Adapt names to established M3/M5 files, but keep repository union pure, disk
application adapter-owned, and command output semantic.

## Layering and source rules

- Merge and diff receive validated repository values from a source loader. They
  never parse local or future HTTP JSON themselves.
- A local operand names a repository root; resolve it against the process cwd
  and read `<operand>/.snap/repository.json`. Do not silently walk upward from
  an operand supplied as a root.
- Only strings starting exactly with `http://` or `https://` are remote; M6
  returns/dispatches those to the future remote loader rather than treating
  them as filesystem paths.
- Union, collision detection, frontier join, warning difference, and mutation
  planning are pure domain operations.
- Working-tree adapters receive a complete target/plan. They do not decide
  conflict winners or edit repository values.
- Reuse M4's tree-to-tree change builder for commit and revert and M5's replay
  for all version trees/warnings.

## Key behaviors

### 1. Typed patch identity and union

Index patches by `(author, revision)`. For every dot present in both
repositories, compare the complete parsed typed patch recursively: author,
revision, canonical base value, message spelling, ordered changes, content,
tokens, and operation counts. JSON object-key order, insignificant whitespace,
and source bytes are irrelevant.

Equal values are one set member. Different values fail with:

```text
snap: patch collision: <author> revision <revision>
```

On success, union the sets, sort author then numeric revision, and join the two
frontiers componentwise using M1. Validate/replay the prepared joined repository
before any write even though both inputs were individually valid.

### 2. Local cross-repository diff

Complete this form:

```text
snap diff <old> <new> --repo <repository>
```

`old` is resolved in the current local repository and `new` in the operand
repository. Parse both CLI versions canonically, validate both repositories and
prove both versions known before producing output. Compare every common dot in
the complete repositories—not only patches selected by `old`/`new`—and fail on
a collision.

Materialize the two trees and use M4's existing semantic diff. The operation is
observational: it does not import patches, alter either frontier, or write
working files. M8 adds HTTP operands through the same source contract.

### 3. Merge preparation

For `snap merge <repository>`:

1. Discover and fully validate the current repository.
2. Resolve/load and fully validate the operand repository.
3. Detect all common-dot collisions and build a typed union.
4. Join frontiers, validate the union, and replay both the local and joined
   frontiers.
5. Scan the local working tree and require exact equality with the current
   local replay, including rejection of unsupported entries.
6. Compute the complete current-to-joined filesystem mutation plan and the
   canonical joined repository bytes.
7. Compute `joinedWarnings - localWarnings` as set difference, sorted path then
   reason.

No contributor configuration is read. Merge authors no patch and increments no
revision.

If the operand history is equal or already contained, the joined frontier,
patch set, tree, and warnings equal local state. Return success with the
unchanged version, perform no file/metadata writes, and emit no warning.

### 4. Revert preparation

For `snap revert <version>`:

1. Discover/load/fully validate the local repository.
2. Strictly parse the target and prove it locally known.
3. Materialize current and target versions.
4. Resolve contributor identity through M2 and scan the working tree; require
   it to equal the current materialized tree.
5. If current and target trees are equal, fail with
   `target tree is already current`.
6. Build one patch against the **current frontier**, using M4's canonical
   current-to-target change selection, message `revert to <version>`, and the
   next configured-author revision.
7. Prepare and fully validate the new repository and target-tree mutation.

The user-supplied target can be `()` or any known causal frontier; it need not
be an existing patch result. Revert never removes a patch and never moves the
frontier backward. Generated revert messages are not subject to the 4096-byte
CLI message limit.

### 5. Cleanliness and mutation order

A dirty working tree fails with exactly:

```text
snap: working tree is dirty
```

An unsupported entry retains M3's more specific error. Any parsing, validation,
collision, unknown-version, replay, cleanliness, or preparation failure makes
zero mutations.

When applying a nonempty target transition:

1. Remove files absent from the target, deepest paths first where necessary.
2. Remove files that block target directories and prune now-empty directories.
3. Create required parent directories.
4. Write/replace target files as binary bytes; unchanged paths need not be
   rewritten.
5. Remove stale empty directories so disk represents exactly the target file
   map (apart from root `.snap`).
6. Only after all working-tree operations succeed, atomically publish the
   prepared `repository.json`.

This handles current file `a` -> target `a/b` and current `a/b` -> target file
`a`. Never traverse or remove through a symlink. If a working write fails
midway, report the I/O failure and leave the old metadata; a partially changed,
dirty working tree is the explicitly accepted failure state.

### 6. Merge warnings and output

Replay returns sets. Merge emits only facts present in joined replay and absent
from pre-merge local replay:

```text
warning: auto-resolved <path>: <reason>
```

Sort by path then reason and write warnings to stderr. Plain merge/revert
success writes the resulting frontier to stdout. Warning selection is computed
before mutation and does not depend on merge direction, current working bytes,
or presentation mode.

## Exact plain outputs and failures

| Case | stdout | stderr | exit |
| --- | --- | --- | --- |
| merge success/no warnings | `<joined-version>\n` | empty | 0 |
| merge success/warnings | `<joined-version>\n` | sorted warning lines | 0 |
| already-contained merge | `<unchanged-version>\n` | empty | 0 |
| revert success | `<new-version>\n` | empty | 0 |
| revert same tree | empty | `snap: target tree is already current\n` | 1 |
| dirty merge/revert | empty | `snap: working tree is dirty\n` | 1 |
| patch collision | empty | `snap: patch collision: <id> revision <n>\n` | 1 |
| unknown target | empty | `snap: unknown version: <V>\n` | 1 |

All output uses LF. A failed local cross-repository diff has empty stdout and
does not modify the current repository.

## Tests to write

### Union, versions, and warning tests

- Disjoint union, equal typed duplicates with different JSON key order/spacing,
  conflicting duplicates, sorted output, componentwise frontier join, and
  joined validation.
- Common-dot collision checking over patches outside requested diff versions.
- Net-new warning set subtraction, deduplication, and unsigned path/reason order.
- Idempotence, commutativity, and association over small repository sets.

### Revert tests

- Revert to empty, earlier patch result, and known non-patch-result causal
  frontier; next revision/result version and exact generated message.
- Additive history/log behavior and repeat target whose tree is already current.
- File-to-directory and directory-to-file transitions; binary, empty, CRLF,
  Unicode, and deletion changes.
- Local/global identity, missing identity, safe revision overflow, dirty and
  unsupported trees, invalid/unknown version, and zero mutation for failures.

### Merge and materialization tests

- Text convergence, identical concurrent changes, all five warning reasons,
  namespace conflicts in both directions, concurrent creates, and exact sorted
  warnings.
- Both merge directions, three-way association permutations, repeated import,
  contained history, and no identity requirement.
- Dirty/untracked/deleted/modified and unsupported working entries preserve
  files and metadata.
- Mutation adapter file/directory transitions, binary bytes, empty-directory
  pruning, unchanged files, and protection of `.snap`.
- Failure injection before any write, during removal/write, and before metadata
  rename; old repository bytes remain published whenever tree application did
  not finish.

### Cross-repository diff tests

- Known local/operand versions, unknown version on each side, both repositories
  fully validated, collisions, equal output, and strict observational behavior.
- Local operand resolution is against process cwd and requires the explicit
  repository root.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M2–M5 complete; set M6 `In Progress` with owner/objective.
1. **Repository union/source boundary**
   - Implement typed equality, collision detection, union/join, and exact local
     operand loading with pure/integration tests.
2. **Local cross-repository diff**
   - Extend the existing diff use case through the source abstraction and add
     complete collision/known-version checks.
3. **Mutation planning and adapter**
   - Add deterministic tree transition plans and binary-safe application across
     file/directory boundaries, with failure injection.
4. **Revert**
   - Integrate known versions, identity, change construction, clean checks,
     working-tree application, and metadata publication.
5. **Merge**
   - Integrate union, joined replay, warning subtraction, no-op detection,
     materialization, and publication without identity.
6. **CLI/plain integration**
   - Register `merge`/`revert`, extend semantic results and plain warnings, and
     add process-level tests.
7. **Completion and handoff**
   - Run every scenario, record exact evidence and the repository-source seam
     M8 extends.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 07-revert
./snap/verify --lang ts --filter 09-merge-text
./snap/verify --lang ts --filter 10-merge-conflicts
./snap/verify --lang ts --filter 11-namespace-conflicts
./snap/verify --lang ts --filter 16-dot-collision
./snap/verify --lang ts --filter 17-concurrent-creates
./snap/verify --lang ts --filter 18-three-way-convergence
./snap/verify --lang ts --filter 19-version-boundaries
./snap/verify --lang ts --filter 20-dirty-merge
./snap/verify --lang ts --filter 21-version-algebra
./snap/verify --lang ts --filter 22-ot-matrix
```

Also rerun scenarios 05, 06, 08, 15, 23, 25, and 27 because M6 changes diff,
repository sources, and mutation boundaries. Mark complete only when both merge
directions and tested association orders converge, failure paths preserve the
required state, and every listed gate passes.
