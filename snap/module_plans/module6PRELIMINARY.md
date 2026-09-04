# Module 6 Preliminary Handoff: Merge and Revert

## Purpose and current baseline

This document is the implementation-facing handoff for `module6PLAN.md`. It
summarizes the parts of M3, M4, and M5 that M6 must reuse, plus the M7 and M8
work that has already landed ahead of M6. Read it together with `SPEC.md`
§§3–8 and 10 and `module6PLAN.md`; it records the current TypeScript APIs and
integration hazards that the plan's original file layout could not know.

Current baseline when this handoff was written:

- M3's working-tree, repository publication, and command infrastructure is
  implemented. Its old `LinearRepository` boundary has been removed.
- M4's canonical content/diff algebra is complete.
- M5's arbitrary causal validator and replay/OT engine is implemented and has
  superseded M3's staged linear validator.
- M7 has already added grammar and plain/terminal presentation primitives.
- M8 has already added repository-source classification and independent HTTP,
  signal, and server/client ports/adapters, although remote repository loading
  is not wired.
- The M6-specific files named by `module6PLAN.md` do not yet exist.
- Relevant commits include `969ffb6` (M5 engine), `c2cbfd5` (M3/M5 boundary
  reconciliation), and `1ece9c9` / `3d91a08` (M7 grammar integration and
  handoff).

The tracker still leaves M3/M5 `In Progress` because of host/harness-only
gates, not missing M6 prerequisites. The post-reconciliation strict check is
green, the focused replay suites pass, and public scenarios 04, 05, 06, 15,
23, 25, and 27 pass through the emitted-JavaScript workaround.

## Non-negotiable inherited architecture

M6 must preserve the functional-core/imperative-shell split already used by
the project:

- Repository union, collision detection, warning subtraction, version join,
  tree mutation planning, and change construction are pure domain functions.
- Repository loading, working-tree scanning, mutation application, and atomic
  metadata publication live behind application ports/adapters.
- Untrusted repository bytes always pass through fatal UTF-8 decoding,
  duplicate-aware JSON parsing, exact schema decoding, complete causal
  validation, and deterministic replay.
- Only `ValidatedRepository` may be passed to known-version selection or
  materialization. There is deliberately no exported brand constructor.
- All merge/revert preparation finishes before the first filesystem mutation.
- Working files are updated before `.snap/repository.json`; metadata is
  published only after the tree application succeeds.
- Do not add a second canonical diff, patch scheduler, replay loop, tree
  comparison, serializer, or repository parser.

## M3 transfer: repository and working-tree shell

### Repository loading boundary

`src/application/repository/load-local-repository.ts` is the current local
command loader. It:

1. discovers the nearest repository from the command `cwd`;
2. reads `.snap/repository.json` as bytes;
3. applies `decodeUtf8Strict`;
4. applies duplicate-aware `parseJsonStrict`;
5. applies `decodeRepositoryDocument`; and
6. applies M5's `validateRepository`.

It returns:

```ts
interface LoadedRepository {
  readonly repoRoot: string;
  readonly repository: ValidatedRepository;
}
```

Reuse this loader for the current repository. Do **not** use it unchanged for
a `merge`/cross-repository `diff` local operand: an operand names an explicit
repository root and must read exactly `<resolved-operand>/.snap/repository.json`
without walking upward. The cleanest M6/M8-compatible refactor is to extract
one shared `decodeAndValidateRepositoryBytes(bytes)` function, then let:

- `loadLocalRepository` own discovery of the current repository;
- `loadLocalOperand` resolve an explicit local root against process `cwd`; and
- M8's future remote loader feed HTTP response bytes into the same decoder.

This avoids duplicating the strict boundary while preserving the different
root-resolution semantics.

### Working-tree scanning and cleanliness

Use `readWorkingTree(repoRoot, ports)` and the existing `WorkingTreePort`.
The Node scanner:

- scans the discovered repository root, never the caller's nested `cwd`;
- excludes only a root-level `.snap` directory;
- treats nested `docs/.snap/...` as tracked content;
- reads exact bytes and ignores empty directories; and
- uses `lstat`-style `entryKind` checks to reject symlinks, FIFOs, devices,
  sockets, and entries lost to a race without following them.

Unsupported entries already return the required specific diagnostic:

```text
unsupported working tree entry: <tracked/path>
```

After a successful scan, require `isTreeClean(currentTree, workingTree)` for
merge/revert. Convert a false result to exactly `working tree is dirty`.
Keep this byte-equality check separate from `selectAuthoredChanges`: the former
answers cleanliness, while the latter constructs a patch.

### Atomic repository publication

Reuse `publishRepository(repoRoot, document, ports)`. It serializes through
`serializeRepositoryDocument`, writes a unique same-directory temporary file
with `writeFileDurable` (`open` + write + `sync` + close), then renames it over
`repository.json`. It performs best-effort temporary-file cleanup if writing
or rename fails.

For M6, call it only after the working-tree mutation adapter completes. If a
working-file operation fails, do not call it. The accepted failure state is a
partially changed/dirty working tree with the old metadata still published;
M6 must not invent rollback or crash-recovery behavior.

### Commit as the mutation-construction reference

`src/application/commands/commit.ts` demonstrates the established prepare
pattern:

- load and validate;
- resolve identity;
- materialize the current frontier;
- scan the working tree;
- build changes with `selectAuthoredChanges`;
- construct a patch and result frontier;
- sort the patch array;
- serialize, parse, decode, and fully revalidate the prepared document; then
- perform the one atomic metadata publish.

Revert should follow this pattern, except its target is a known historical
tree and it must apply working-tree mutations before publication. Merge must
not resolve contributor identity and must not construct a patch.

### M3 filesystem gap M6 must fill

The existing `FileSystemPort` has string `writeFile`, byte reads, metadata temp
file operations, `entryKind`, `mkdirRecursive`, and file unlink. It does not
provide the complete binary file/directory mutation surface M6 needs.

Prefer the dedicated `TreeMaterializationPort` and Node adapter from the M6
plan instead of turning the general metadata port into a conflict-resolution
layer. The adapter must accept a completely prepared plan/target, write
`Uint8Array` bytes, remove files, create parents, and prune empty directories.
It must never make merge-winner decisions and must never traverse a symlink.

## M4 transfer: canonical bytes, changes, and displayed diffs

### Canonical `FileTree`

The one representation is:

```ts
type FileTree = ReadonlyMap<string, Uint8Array>;
```

Use `constructFileTree(entries)` whenever constructing a tree from external or
adapter input. It validates tracked paths, duplicate paths, prefix freedom,
and unsigned UTF-8 ordering. Do not introduce a second branded tree type.

`bytesEqual` is the canonical byte comparator. `compareTrees`/`isTreeClean`
produce lightweight byte deltas. `selectAuthoredChanges(current, target)` is
the canonical tree-to-patch builder and returns sorted immutable `text`,
`put`, or `delete` changes.

### Revert patch construction

For revert, call:

```ts
const changes = selectAuthoredChanges(current.tree, target.tree);
const patch = constructPatch({
  author,
  base: currentRepository.document.frontier,
  message: `revert to ${formatVersion(targetVersion)}`,
  changes,
});
```

Important inherited details:

- text is valid UTF-8 with no NUL;
- tokenization splits immediately after LF and retains LF;
- binary/non-text targets become canonical padded-base64 `put` changes;
- canonical text diff uses the exact delete-on-tie DP recurrence;
- edit scripts completely consume the old token stream; and
- the generated revert message uses `validateMessage` without the commit-only
  4096-byte cap.

If `isTreeClean(current.tree, target.tree)` is true, fail with `target tree is
already current` before constructing a patch. Revert remains additive: its
base is the current frontier, only the configured author's revision advances,
and no old patch is removed.

### Cross-repository displayed diff

Once both versions have been proved known and materialized in their respective
repositories, call `buildDiffRecords(oldTree, newTree)`. Existing plain and
terminal renderers already understand `DiffRecord[]`, including repeated-line
ties, CRLF, Unicode, binary files, empty files, `/dev/null`, and missing-final-
LF markers. M6 should not format diff text in the application use case.

## M5 transfer: validated DAGs, replay, OT, and warnings

### Opaque validated repository

The current types are:

```ts
interface RepositoryDocument {
  readonly format: 1;
  readonly frontier: Version;
  readonly patches: readonly Patch[];
}

interface ValidatedRepository {
  readonly document: RepositoryDocument;
  // private unique-symbol brand
}
```

`materializeVersion(repository, version)` and
`selectKnownPatches(repository, version)` require `ValidatedRepository`, not a
plain `RepositoryDocument`. Do not reintroduce `LinearRepository`,
`validateLinearRepository`, or an exported unchecked brand constructor.

This affects joined-repository preparation: union produces a candidate typed
document, but that candidate is not yet validated and cannot be passed to
materialization. Route it through the same serialize → strict parse → schema
decode → `validateRepository` sequence used by `commit`. Consider extracting
a shared `validatePreparedRepository(document)` helper and refactoring commit
to use it so merge and revert do not each reproduce the boundary.

### Patch identity and union building blocks

Reuse these existing functions:

- `dotKey(author, revision)` for collision indexes;
- `indexRepository(document)` for dot/max-revision lookup;
- `patchesStructurallyEqual(left, right)` for complete parsed typed equality;
- `sortPatches(patches)` for canonical author/revision storage order; and
- `joinVersions(left, right)` for componentwise frontier maximum.

`patchesStructurallyEqual` compares author, revision, base components, exact
message spelling, ordered changes, operation kinds/counts/tokens, and put
content. JSON whitespace and object-key order have already disappeared during
decoding and must not participate in identity.

The union algorithm should therefore:

1. index both complete patch sets by dot;
2. inspect every common dot, not only patches selected by requested versions;
3. fail immediately on a non-equal common patch with
   `patch collision: <author> revision <revision>`;
4. retain one copy of equal common patches;
5. add disjoint patches;
6. canonicalize with `sortPatches`;
7. join frontiers with `joinVersions`; and
8. fully validate the prepared joined document before replay or mutation.

The domain union should be idempotent, commutative, and associative by typed
patch value. A merge never creates a patch or advances a revision.

### Known versions and replay

`materializeVersion`:

- proves the target is a known causal closure;
- dynamically schedules selected patches through `schedulePatches`;
- recursively materializes each patch's exact base;
- integrates against immutable base/current snapshots;
- returns `{ tree, warnings }`; and
- deduplicates/sorts warning facts by unsigned UTF-8 path then reason.

A known version may be `()`, a patch result, or a causal join that is not any
single patch's result. M6 must support all three for revert and cross-repo diff.
Map a syntactically valid materialization failure at a user-supplied version to
the stable command diagnostic `unknown version: <original-text>`; keep invalid
CLI syntax as `invalid version: <parser-detail>`.

Do not sort patches independently for replay. `schedulePatches` recomputes the
ready set after every integration and breaks ties by patch-result Snap order,
then unsigned UTF-8 author, then numeric revision. Storage order remains only
the repository serialization invariant.

### OT and conflict resolution are already complete

M6 should treat `materializeVersion` as the conflict engine. Do not duplicate
or specialize the following inside merge:

- patch-wide namespace resolution before path-level work;
- the `B === C`, `C === T`, text-OT, fallback dispatch order;
- aggregate-context `canonicalDiff(B, C)`;
- dual-cursor count splitting and trailing-insert handling;
- strict context-insert priority;
- the six whole-path winner rules; or
- simultaneous installation/removal and final prefix-free validation.

The warning reasons are exactly:

```text
delete-wins
later-create-wins
later-put-wins
namespace-wins
put-wins
```

Use `sortWarningFacts` for canonical deduplication/order. Add one pure warning
difference function that keys facts by both path and reason and returns:

```text
joinedMaterialization.warnings - localMaterialization.warnings
```

Only this net-new set is printed by merge. Text OT itself emits no warning.

## M7 transfer: grammar and presentation already present

Do not recreate the CLI grammar or success result variants.

Already implemented:

- `CommandRequest` includes `MergeRequest`, `RevertRequest`, and the
  cross-repository `DiffRequest.repo` field.
- `parseCliArgs` accepts `merge <repository>`, `revert <version>`, and
  `diff <old> <new> --repo <repository>` with the required usage diagnostics.
- `CommandResult` already has `merged` and `reverted` variants.
- `renderCommandResult` prints their plain result versions.
- `renderCommandResultTerminal` prints their styled terminal success lines.
- `formatCliWarningLineTerminal` already implements terminal warning styling.
- Presentation resolution already treats stdout and stderr independently.

Still missing for M6:

- `src/cli/commands/merge.ts` and `revert.ts`;
- entries for `merge` and `revert` in `dispatch.ts`'s `COMMANDS` map;
- cross-repository handling in `cli/commands/diff.ts` (it currently throws
  `cross-repository diff is not yet implemented`); and
- M6 ports in `CliPorts`/`main.ts`.

There is also an important warning-channel gap: a successful merge can have
both stdout (the version) and stderr (warnings), but the current `runCli`
success path always sets `stderr: ""`, and the pre-added `merged` result only
contains a version. M6 must extend the semantic result/dispatch path so
warnings remain structured until presentation is selected. A suitable shape
is a `merged` result containing `readonly warnings: readonly WarningFact[]`,
with separate plain/terminal warning renderers used by `runCli` for stderr.
Do not concatenate warnings into stdout or pre-render them in the application
command.

Expected application failures remain `DomainError` values and exit 1. Thrown
adapter/I/O failures are caught by dispatch and exit 2. Preserve that split.

## M8 transfer: source seam and network primitives already present

`src/application/repository/source.ts` already defines:

```ts
type RepositorySource =
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "remote"; readonly url: string };
```

and `classifyRepositorySource`, where only exact lowercase `http://` and
`https://` prefixes are remote. All other operands are local paths. M6 should
reuse this function rather than adding a second classifier.

M8's independent `HttpClientPort`, `HttpServerPort`, `SignalPort`, and Node
adapters also exist. M6 does not need to wire HTTP to satisfy its local exit
gate, but its repository-source abstraction should make M8's next step a
loader addition, not a merge/diff rewrite. Keep merge and cross-repo diff
dependent on a loader that returns the same `ValidatedRepository` regardless
of local/remote origin.

The current `CliPorts` and `main.ts` do not yet expose the HTTP ports. Do not
couple M6's pure union/diff/merge logic directly to the existing Node HTTP
adapter; M8 will add `loadRemoteRepository` and wire those ports.

## Recommended M6 domain/application seams

Names may vary, but these responsibilities should remain separate:

### Pure domain

- `unionRepositories(left, right)`:
  collision-check complete patch sets, deduplicate equal dots, sort patches,
  and join frontiers; return a candidate `RepositoryDocument` or domain error.
- `differenceWarningFacts(joined, local)`:
  set difference on `(path, reason)`, using `sortWarningFacts` for output.
- `planTreeMutation(current, target)`:
  produce deterministic removals, directory requirements, byte writes, and
  pruning work without touching disk.

### Repository application boundary

- `decodeAndValidateRepositoryBytes(bytes)`:
  shared strict bytes-to-`ValidatedRepository` pipeline.
- `loadLocalOperand(cwd, operand, ports)`:
  resolve against process `cwd`, require that exact root, and load its root
  manifest without discovery.
- a local/remote-neutral source loader interface consumed by merge and
  cross-repo diff; M6 supplies local, M8 adds remote.
- `validatePreparedRepository(document)`:
  safely convert constructed typed documents back through the complete M5
  validation boundary without exposing a brand cast.

### Tree mutation application

- `TreeMaterializationPort.apply(repoRoot, plan)` or an equivalent complete
  target operation.
- Node adapter operations must use binary bytes, validated tracked paths, and
  non-following entry checks.
- The adapter receives decisions; it does not compute conflict winners.

## Command preparation algorithms

### Cross-repository diff

1. Load/fully validate current and operand repositories.
2. Compare all common dots and fail on any typed collision.
3. Strictly parse both version operands.
4. Prove/materialize `old` in the local repository and `new` in the operand.
5. Build `DiffRecord[]` with `buildDiffRecords`.
6. Return without scanning or mutating either working tree and without
   importing any patch.

Collision checks cover the complete repositories even when the colliding dot
is outside the two requested version closures.

### Revert

1. Load/fully validate the current repository.
2. Parse the target and materialize it as a locally known version.
3. Materialize the current frontier.
4. Resolve contributor identity using the existing strict local-then-global
   M2 function.
5. Scan the current working tree and require exact cleanliness.
6. Reject an equal current/target tree with `target tree is already current`.
7. Build canonical changes with `selectAuthoredChanges`.
8. Construct one patch against the current frontier with message
   `revert to <canonical-version>`.
9. Compute the result frontier, append/sort patches, and fully revalidate the
   prepared repository.
10. Prepare the complete current-to-target filesystem plan.
11. Apply working files.
12. Publish metadata atomically.
13. Return the new frontier. Do not remove history or print replay warnings.

### Merge

1. Load/fully validate current and operand repositories. Do not resolve
   contributor identity.
2. Collision-check and union complete patch sets; join frontiers.
3. Fully validate the prepared joined repository.
4. Materialize the local frontier and joined frontier.
5. Scan the local working tree and require it to equal the local replay.
6. Compute net-new warning facts and the deterministic tree mutation plan.
7. If history, frontier, tree, and warnings are already contained/equal,
   return the unchanged version with no warnings and perform zero writes.
8. Otherwise apply working files, then atomically publish joined metadata.
9. Return the joined version plus structured net-new warnings.

Even a contained/equal merge still has the command's clean-tree requirement;
the no-op optimization occurs only after validation/replay/cleanliness.

## Mutation planning details

The current and target maps are both prefix-free. A safe deterministic plan
must handle both namespace direction changes:

- current file `a` → target file `a/b`: remove `a`, create directory `a`,
  write `a/b`;
- current file `a/b` → target file `a`: remove `a/b`, prune empty directory
  `a`, write file `a`.

Recommended ordering:

1. identify changed/removed current files and remove blockers, deepest tracked
   paths first;
2. prune now-empty directories deepest first, never crossing repository root;
3. create required target parents shallowest first;
4. write changed/new target files in unsigned UTF-8 path order with exact
   bytes; and
5. prune any remaining stale empty directories.

Unchanged files need not be rewritten. Never mutate root `.snap`, never derive
an absolute path from an unvalidated tracked path, and recheck entry kinds at
the adapter boundary so a race cannot turn a planned directory traversal into
symlink traversal.

## Required error/output contracts

Keep these exact application details; the CLI renderer adds `snap: ` and LF
for expected errors:

```text
working tree is dirty
target tree is already current
patch collision: <author> revision <revision>
unknown version: <original-version-text>
```

Plain successful merge/revert stdout is `<version>\n`. Plain merge warnings
are sorted and written only to stderr:

```text
warning: auto-resolved <path>: <reason>
```

An already-contained merge succeeds, prints the unchanged joined version,
emits no warning, and performs no working-file or metadata write.

## Tests to preserve and add

### Existing regression suites to rerun while implementing

- M3: working-tree scanner, repository publication, commit/status/log/diff,
  and `m3-m5-reconciliation.test.ts`.
- M4: canonical diff, edit construct/apply, content classification,
  tree change selection, and diff-record rendering.
- M5: repository validation, known versions/materialization, scheduler,
  OT transform, namespace/path conflicts, warning identity, and seeded replay
  convergence.
- M7/M8 primitives: CLI grammar matrix, plain/terminal rendering,
  presentation selection, and repository-source classification.

### M6-focused tests by layer

1. **Union:** disjoint sets, equal typed dots from differently formatted JSON,
   every differing patch field, collisions outside requested diff closures,
   canonical sort, frontier join, and idempotent/commutative/associative
   properties.
2. **Warnings:** empty difference, inherited-warning suppression, new warning,
   duplicate facts, same path/different reason, and unsigned UTF-8 ordering.
3. **Mutation plan/adapter:** binary/empty bytes, unchanged-file elision,
   deletions, both file/directory transition directions, deep pruning,
   `.snap` protection, symlink/race rejection, and deterministic operation
   order.
4. **Cross-repo diff:** each side unknown, invalid versions, full-repository
   collision check, explicit-root resolution, equal trees, binary/text output,
   and proof of zero writes/import.
5. **Revert:** empty target, earlier patch result, non-patch-result causal join,
   additive log history, exact message, author revision overflow, missing/
   invalid identity, equal tree, dirty tree, unsupported entry, and mutation
   failure leaving metadata unchanged.
6. **Merge:** both directions, three association orders, repeated/contained
   imports, no identity, text OT, all five warning reasons, namespace conflicts,
   concurrent creates, dirty/unsupported trees, and failures before/during
   application with old metadata retained.
7. **CLI/presentation:** merge warnings on stderr in plain and terminal modes,
   success version on stdout, grammar wiring, exit codes, and zero output before
   a failed preparation completes.

The public M6 gate is scenarios 07, 09, 10, 11, and 16–22. Also rerun 05, 06,
08, 15, 23, 25, and 27 because M6 changes diff, repository sources, and
mutation boundaries.

## Host/test note

On this Windows account, the normal `tsx` launcher can fail before test
discovery with `uv_os_get_passwd ENOMEM`. The established workaround is to
emit the test project into an external/temporary directory and run the emitted
JavaScript with `node --test`. Do not place emitted output under a tracked
repository path, and always remove it after verification. Symlink scenarios
may skip/fail when the account lacks link-creation privilege; record that as a
host limitation rather than weakening the non-following safety contract.

## Suggested implementation order

1. Mark M6 `In Progress` and record ownership in `modules.md`.
2. Extract the shared bytes/prepared-document validation helpers.
3. Implement pure union/collision and warning-difference functions with dense
   tests.
4. Implement explicit local operand loading on the existing source seam.
5. Complete observational cross-repository diff.
6. Implement mutation planning and its Node adapter with failure injection.
7. Implement revert end-to-end.
8. Implement merge, including no-op detection and structured warnings.
9. Wire the already-defined M7 grammar/results/renderers and extend `CliPorts`
   / `main.ts` for M6 dependencies without disrupting M8's existing seams.
10. Run focused regression suites after each layer, then the complete public
    M6 and affected-regression matrix.
