# Module 3 Progress: Working Tree and Linear History

## Status

**Implemented, `In Progress` in `snap/modules.md` (not `Complete`)**

All scope from `module3PLAN.md`, corrected by the pre-implementation review
plan `ok-now-i-want-zany-pinwheel.md` (recorded as
`module3planCORRECTIONS.md`), is implemented, unit- and process-tested, and
committed in four commits (`6606d68`, `5557753`, `e5624b8`, `9e87bb7`). The
module is not marked `Complete` because the public acceptance harness
(`./snap/verify`) cannot yet run its scenarios on this Windows host — see
"Verification" and the newly-diagnosed `spawn EFTYPE` blocker below.

---

## Corrections applied before implementation

`module3planCORRECTIONS.md` (mirroring `module1planCORRECTIONS.md`'s format)
records nine corrections made to `module3PLAN.md` before writing code, based
on a review pass against what M4 actually shipped and the same category of
gaps `module1REVIEW.md` caught for M1 (forgeable types, loose contracts,
implicit byte/escaping rules, symlink handling, missing boundary tests):

1. Reuse M4's `FileTree = ReadonlyMap<string, Uint8Array>` as-is; add M3
   invariant enforcement (tracked-path validity, prefix-freedom, no
   duplicates, canonical sort) via a validating constructor
   (`constructFileTree`), not a second incompatible type.
2. Pin the working-tree scan root/exclusion contract explicitly: scan root is
   the discovered repository root (not `cwd`); only a `.snap` directory that
   is the *first* path segment is excluded; empty directories (including ones
   empty only because everything under them was excluded) are never listed;
   symlinks/FIFOs/other special entries are rejected via `entryKind` without
   a second stat and without being followed, with the exact
   `unsupported working tree entry: <path>` diagnostic using `/`-separated
   tracked-path form.
3. Pin the exact repository-publish byte/atomicity contract: unique
   same-directory temp file, durable flush (`sync()` before close) before
   rename, `fs.rename` for atomic replace, best-effort temp cleanup on
   failure, and a real-fs failure-injection test (rename fails) proving
   `repository.json` is byte-unchanged.
4. Give commit-message validation one home (`validateMessage`), shared by
   schema decoding of stored patches and the `commit` use case's own
   4096-byte-UTF-8 boundary check.
5. Pin the `log` escaping order precisely: backslash first, then tab, then
   LF — tested against the exact scenario 04 golden message containing a
   literal tab, LF, and backslash, not a hand-rolled example.
6. Keep SPEC §7.11's terminal-mode blank-line-between-log-entries rule out of
   the §7.4 plain renderer M3 owns; explicit test asserting no blank line
   between plain-mode log records.
7. Test multi-author, single-repository serial commits (reconfiguring
   `contributor.id` between commits) even though no public scenario exercises
   it directly — verifies `commit` only advances the authoring contributor's
   frontier component.
8. Name the M3 staged-validation result type `LinearRepository` /
   `validateLinearRepository`, distinct from M5's eventual arbitrary-causal
   `ValidatedRepository`, with a comment at the definition site naming what
   M5 adds on top (causal closure under concurrency, exact-base validation,
   replay/OT).
9. Keep `status`'s A/M/D classification (`compareTrees`/`isTreeClean`) as a
   separate, lighter byte-equality delta from `commit`'s full change
   construction (M4's `selectAuthoredChanges`) — two different consumers,
   two different-shaped outputs from the same pair of trees.

## What was implemented

### Tree domain (`domain/tree/`)
- `path.ts` — branded `TrackedPath` with the SPEC §2 validating constructor.
- `construct.ts` — `constructFileTree`, the single validating constructor
  into M4's `FileTree` (sorted, duplicate-free, prefix-free).
- `compare.ts` — `compareTrees`/`isTreeClean`, the lighter delta `status`
  uses (Correction 9); does not build on `selectAuthoredChanges`.

### Repository domain (`domain/repository/`)
- `message.ts` — `validateMessage`, shared by schema decoding and `commit`.
- `schema.ts` — exact `repository.json` shape decode (stage 2/3 validation)
  into a raw, not-yet-semantically-validated intermediate.
- `linear-history.ts` — `validateLinearRepository` decodes and replays a
  generated (serial, possibly multi-author) linear history from the empty
  tree in one pass, reusing M4's `constructEdit`/`applyEdit`/
  `classifyContent`/`decodeBase64` with no reimplementation. Returns every
  known version's materialized tree (`versions` map) so no command re-replays
  history to materialize a version. Named and commented per Correction 8.
- `patch.ts` — `computePatchResult`/`constructPatch`, shared by replay and
  `commit`.
- `serialize.ts` — canonical `repository.json` encoder (2-space indent,
  trailing LF).
- `types.ts` — extended the pre-existing stub (`Change`/`Patch`/
  `RepositoryDocument`/`LinearRepository`) with the `versions` map.

### Filesystem and adapters
- `ports/filesystem-port.ts` + `adapters/node-filesystem-adapter.ts` —
  added `writeFileDurable` (open+write+sync+close), `renameFile`,
  `removeFileIfExists`, `listDirectory`.
- `ports/working-tree-port.ts` + `adapters/node-working-tree-adapter.ts` — a
  non-following, byte-aware recursive scanner implementing Correction 2's
  exact exclusion/empty-directory/symlink rules.
- `application/repository/publish-repository.ts` — atomic `repository.json`
  replacement per Correction 3.

### Commands and CLI wiring
- `application/repository/load-local-repository.ts` — the one function every
  M3 command routes through: discovery → byte load → fatal UTF-8 → duplicate-
  aware JSON → exact schema → generated-linear semantic validation.
- `application/working-tree/read-working-tree.ts` — scan orchestration
  pinned to the discovered repository root.
- `application/commands/{status,log,diff,commit}.ts` — application use
  cases. `commit` follows the prepare/apply model (message validation →
  repository load → identity resolution → working-tree scan → change
  construction → full re-decode/re-validate of the prepared document, all
  before the single atomic publish).
- `cli/results.ts`, `cli/render.ts` — new semantic result kinds and exact
  plain-mode rendering (Corrections 5, 6).
- `cli/commands/{status,commit,log,diff}.ts` + `dispatch.ts` — CLI grammar
  and wiring (status/log: no arguments; commit: exactly one message operand;
  diff: zero or two version operands).

### Tests
Unit tests for every new domain file; real-filesystem tests for the scanner
(full exclusion/empty-directory/symlink matrix) and for atomic publish
(including the rename-failure-injection case); process-level tests
(`test/{status,commit,log,diff}-command.test.ts` via a shared
`test/support/real-cli.ts` harness) exercising every command through the real
Node adapters end-to-end, including the exact scenario 04/05/06/25 goldens
and the Correction 7 multi-author-serial-commit case.

## Verification

- `npm --prefix snap/ts run check`: clean (production build, test build,
  lint).
- Direct `npx tsx --test "test/**/*.test.ts"` (bypassing the Windows `tsx`
  launcher issue M1/M2/M4 also hit): 296/301 passing as of the last M3
  commit — the one failure was in a concurrently-edited M5
  `ready-scheduler.test.ts`, not an M3 file; the 4 skips are the pre-existing
  Windows unprivileged-symlink-creation skip.
- `./snap/verify --lang ts --filter <scenario>` for 03/04/05/06/08/25: not
  yet passing on this host — see below.

### New Windows verifier blocker: `spawn EFTYPE`

`./snap/verify` now actually starts (progress past the `tsx` `uv_os_get_passwd`
ENOMEM crash M1/M2/M4 hit), but every case fails immediately with
`step 1 (run): spawn EFTYPE`. Root-caused separately from the M3 agent's own
report — see the investigation below. This blocks the public exit gate for
**every** module on this host, not just M3.

## Deferred to later modules

- Arbitrary causal-graph validation, exact-base validation under concurrency,
  and full replay/OT: M5 (`ValidatedRepository`, distinct from this module's
  `LinearRepository` per Correction 8).
- `merge`, `revert`, `diff --repo` (cross-repository): M6.
- ANSI terminal presentation of status/log/diff/commit output: M7 (plain
  mode only is in scope here).
- HTTP serving and remote repository loading: M8.

## Known risk: concurrent-session file contention

This module was implemented while other sessions were concurrently active in
the same working tree on M4–M8 scope. Files this module owns
(`domain/repository/types.ts`, `schema.ts`, etc.) were observed being edited
mid-task by another session, and after the M3 commits landed, a concurrent M5
session began superseding `LinearRepository`/`validateLinearRepository` call
sites with its own `ValidatedRepository`/`materializeVersion` machinery.
`git log` should be checked against the current working tree before assuming
the M3 commits above still reflect exactly what other modules build against.
