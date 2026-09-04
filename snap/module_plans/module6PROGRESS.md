# Module 6 Progress: Merge and Revert

## Status

**Implementation complete; tracker remains `In Progress` only because the current
Windows host cannot create the symlinks required to finish public scenarios 08
and 20.**

The implementation landed in commit `2862889` (`M6: implement merge revert and
local repository integration`). It was built on the completed M5 opaque
`ValidatedRepository` and replay/OT boundary, while preserving the M7 grammar and
presentation work and the M8 HTTP primitives that had already landed.

M6 now provides local merge, additive revert, local cross-repository diff,
collision-safe repository union, net-new merge warnings, prepared working-tree
materialization, and a repository-source port that M8 can extend for HTTP.

## Implemented behavior

### Repository decoding and prepared validation

`src/application/repository/decode-repository.ts` is now the shared strict
repository boundary:

```ts
decodeAndValidateRepositoryBytes(bytes): Result<ValidatedRepository, DomainError>
validatePreparedRepository(document): Result<ValidatedRepository, DomainError>
```

The byte decoder performs fatal UTF-8 decoding, duplicate-aware JSON parsing,
exact schema decoding, complete causal validation, exact-base validation, and
deterministic replay. `loadLocalRepository`, local operands, future remote
responses, and in-memory documents prepared by commit/merge/revert must reuse
this boundary. Do not add another repository parser or bless a plain
`RepositoryDocument` as validated.

`commit.ts` was refactored to use `validatePreparedRepository`, so all three
authoring/import paths now share the same serialize/redecode/revalidate rule.

### Typed repository union and collisions

`src/domain/repository/union.ts` adds:

```ts
checkPatchCollisions(left, right)
unionRepositoryDocuments(left, right)
```

Every common `(author, revision)` dot in the complete repositories is compared
with `patchesStructurallyEqual`. A mismatch returns exactly:

```text
patch collision: <author> revision <revision>
```

Equal duplicates collapse, disjoint patches are retained, storage is canonicalized
with `sortPatches`, and frontiers are joined componentwise with `joinVersions`.
The resulting candidate is deliberately still untrusted and is passed through
`validatePreparedRepository` before replay or mutation.

Cross-repository diff uses the same complete collision check and never imports
history.

### Repository-source seam

M6 introduced `RepositorySourcePort` in
`src/ports/repository-source-port.ts`:

```ts
interface RepositorySourcePort {
  load(source: RepositorySource, cwd: string):
    Promise<Result<{ repository: ValidatedRepository }, DomainError>>;
}
```

`merge` and cross-repository `diff` classify the operand with
`classifyRepositorySource` and then depend only on this port. They are transport
neutral after loading.

`createLocalRepositorySourceAdapter(fileSystem)` is the current implementation.
For local operands it calls `loadLocalOperand`, which resolves the operand against
the process `cwd` and reads exactly:

```text
<resolved operand>/.snap/repository.json
```

It never walks upward. The adapter currently returns
`remote repository loading is not yet implemented` for HTTP sources. M8 should
replace or extend this adapter; it should not rewrite merge/diff.

### Local cross-repository diff

`diffAcrossRepositories` in `src/application/commands/diff.ts` now:

1. fully loads the discovered local repository;
2. fully loads the explicit operand through `RepositorySourcePort`;
3. checks every common dot for structural collision;
4. parses and proves both requested versions known in their respective
   repositories;
5. materializes both through M5; and
6. returns M4 `DiffRecord[]` without writes or imports.

`src/cli/commands/diff.ts` routes the existing M7 `--repo` grammar form to this
use case.

### Revert

`src/application/commands/revert.ts` implements an additive revert:

- loads and fully validates the local repository;
- parses and materializes any locally known causal target, including `()` and
  known joins that are not patch-result versions;
- resolves contributor identity because revert authors a patch;
- scans the repository root and requires byte-exact cleanliness;
- rejects an equal target tree with `target tree is already current`;
- builds changes with the shared `selectAuthoredChanges` implementation;
- authors against the current frontier with message
  `revert to <canonical-version>` and advances only the configured author;
- fully validates the prepared repository;
- applies the prepared target-tree transition; and
- publishes metadata only after working-tree application succeeds.

Generated revert messages use the normal message validator without commit's
4096-byte CLI limit.

### Merge

`src/application/commands/merge.ts` now performs:

1. local and operand validation;
2. complete typed collision checking and patch-set union;
3. frontier join and full revalidation of the joined document;
4. local and joined replay through M5;
5. local working-tree scan and clean-tree enforcement;
6. complete mutation planning;
7. `joinedWarnings - localWarnings`; and
8. working-tree application followed by atomic metadata publication.

Merge never reads contributor identity, never creates a patch, and never advances
a revision independently of imported history. A contained/equal history with an
empty mutation plan is a true no-op: it returns the unchanged joined version,
does not rewrite files or metadata, and emits no warnings.

`src/domain/history/warning-difference.ts` subtracts warning facts by the complete
`(path, reason)` pair and returns the existing canonical unsigned-UTF-8 order.

### Tree mutation planning and application

`src/domain/tree/mutation-plan.ts` is the pure current-to-target planner. It emits:

- removals for current files absent from the target, deepest paths first; and
- changed/new binary writes in unsigned UTF-8 path order.

`TreeMaterializationPort` keeps the application use cases independent of Node
filesystem operations. `createNodeTreeMaterializationAdapter`:

- rejects metadata paths and paths escaping the repository root;
- uses `lstat`-style checks and does not knowingly traverse symlinks;
- removes obsolete/blocking files;
- prunes empty parent directories;
- creates target parents one component at a time; and
- writes exact `Uint8Array` bytes.

This handles file-to-directory and directory-to-file transitions. If a working
file operation fails midway, the old `repository.json` remains published; the
partially changed dirty tree is the accepted SPEC §10 failure state. No rollback
or crash-recovery protocol was added.

### CLI results, warnings, and dispatch

M6 registered `merge` and `revert` in `src/cli/dispatch.ts` and added their
command handlers. The M7 grammar already accepted both forms and is reused.

The semantic merge result is now:

```ts
{ kind: "merged"; version: Version; warnings: readonly WarningFact[] }
```

Warnings remain structured through execution. Dispatch renders stdout and stderr
independently:

- plain stderr: `warning: auto-resolved <path>: <reason>\n`;
- terminal stderr: yellow `⚠`, followed by the yellow detail without the
  `warning:` prefix.

Merge/revert success rendering already uses M7's plain and terminal result
renderers. Expected `DomainError` values remain exit 1; thrown adapter failures
remain exit 2.

`CliPorts.treeMaterialization` and `CliPorts.repositorySource` are optional only
to preserve older single-command test fixtures. The merge/revert handlers require
the appropriate adapters and throw if they are absent. `main.ts` supplies both in
normal execution.

## What Module 7 still needs

Most M7 integration work described by the older `module7PROGRESS.md` is now done:

- merge/revert handlers are registered;
- semantic merge warnings reach stderr;
- plain and terminal success output is wired;
- per-stream presentation selection applies to merge stdout and warning stderr;
- scenario 24 passes; and
- M6 completes the revert step that previously blocked part of scenario 14.

The remaining visible M7/M8 boundary is `--serve`:

- `parseCliArgs` already parses `--serve [port]` and reports exact invalid-port
  diagnostics;
- `CommandResult` and both renderers already contain `serve-startup`, whose URL
  is always plain;
- `runCli` currently special-cases only `--version`, and the `COMMANDS` map has no
  serve handler;
- therefore an actual `--serve` invocation currently falls through to
  `invalid command or arguments`.

This is why a post-M6 run of scenario 14 reached the invalid-port case but got the
general grammar error. Completing the serve dispatch/lifecycle in M8 should also
close that remaining scenario-14 failure. Do not move merge warning formatting
into the merge use case or concatenate warnings into stdout while changing
dispatch.

Module 7 should rerun at least scenarios 14, 24, and 28 after serve is wired, plus
a terminal merge with a warning. Scenario 28's expected merge warning is:

```text
ESC[33m⚠ESC[0m ESC[33mauto-resolved same: later-create-winsESC[0m\n
```

## What Module 8 should do

### Extend the source adapter, not merge/diff

Construct a source adapter that handles both variants of `RepositorySource`:

- local: retain the exact current `loadLocalOperand` behavior;
- remote: call `HttpClientPort.get(source.url)` exactly once, require status 200,
  and pass the raw response body to `decodeAndValidateRepositoryBytes`.

Then replace `createLocalRepositorySourceAdapter(fileSystem)` in `main.ts` with
the combined adapter. `merge` and `diffAcrossRepositories` should need no domain
or orchestration changes.

The existing M8 primitives are already available:

- `HttpClientPort` and `createNodeHttpClientAdapter`;
- `HttpServerPort` and `createNodeHttpServerAdapter`;
- `SignalPort` and `createNodeSignalAdapter`; and
- `RepositorySource` classification for exact lowercase `http://` and
  `https://` prefixes.

Keep HTTP status failures as expected command errors containing `HTTP <status>`.
Transport/programmer failures should follow the project's expected-versus-thrown
policy deliberately; verify the exact scenario requirements rather than allowing
an accidental exit-code change. Do not follow redirects, retry, decode response
text in the HTTP adapter, or add a repository-size limit.

### Preserve M6 validation and safety ordering

For remote merge/diff, do not bypass any M6 stage:

- both repositories must become `ValidatedRepository` values;
- complete common-dot collision checking still occurs;
- the joined repository is revalidated before replay;
- remote diff stays observational;
- remote merge checks the local working tree before applying its prepared plan;
- working files are applied before metadata publication; and
- malformed/non-200/colliding sources produce no local mutation or partial diff
  output.

### Add the long-running serve lifecycle

The current `CliOutcome`/`runCli` path models immediate commands and `main.ts`
writes buffered stdout/stderr after the command resolves. M8 must add a serve
execution path that:

1. discovers and fully validates the local repository;
2. serializes one immutable startup snapshot;
3. binds `127.0.0.1` through `HttpServerPort`;
4. publishes and flushes the actual plain startup URL before waiting;
5. registers SIGINT/SIGTERM listeners;
6. closes idempotently and removes listeners; and
7. exits cleanly with no second output record.

Do not make the renderer own sockets/signals, and do not make the HTTP server
adapter parse repository JSON.

## Verification evidence

Latest M6 verification on 2026-09-04:

- `npm --prefix snap/ts run check`: passed.
- Native `npm run test:unit`: host launcher failure before discovery because
  `tsx` calls `os.userInfo()` and receives `uv_os_get_passwd ENOMEM`.
- Emitted-JavaScript workaround: 341 tests passed, 4 skipped solely because this
  Windows account cannot create symlinks.
- Focused `module6.test.ts`: 4/4 passed, covering warning subtraction, mutation
  planning, additive revert, local cross-repository diff, merge, and idempotency.
- Public M6 scenarios 07, 09, 10, 11, 16, 17, 18, 19, 21, and 22 passed.
- Public scenario 20 passed its dirty-tree assertions, then the harness itself
  failed with `EPERM` while creating the symlink used by its unsupported-entry
  case.
- Regression scenarios 05, 06, 15, 23, 24, 25, and 27 passed.
- Regression scenario 08 was likewise blocked at harness symlink creation with
  `EPERM`.

The tracker intentionally remains `In Progress` under the repository's strict
completion rule. On a symlink-capable Linux/macOS/CI host, rerun:

```bash
./snap/verify --lang ts --filter 08-unsupported-entries
./snap/verify --lang ts --filter 20-dirty-merge
```

If both pass, M6 can be marked `Complete` without further implementation work.

## Coordination notes

- The repository is a shared working tree. At this handoff, unrelated staged and
  untracked work still exists; inspect `git status` and do not sweep it into M7/M8
  commits.
- `module6PRELIMINARY.md` remains useful historical context, but this document
  reflects the implemented APIs and the post-M6 verification state.
- The M6 implementation commit is `2862889`; use current `HEAD` and current files
  when reconciling later concurrent changes.
