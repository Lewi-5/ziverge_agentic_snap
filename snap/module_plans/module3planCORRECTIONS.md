# Module 3 Plan Corrections

These corrections supplement `module3PLAN.md`. They do not change Module 3's
scope, dependency order, or exit gate. Their purpose is to reconcile the
original detailed draft with what M4 actually shipped (its API differs in
small ways from what `module3PLAN.md` guessed), and to close the same
categories of gap the M1 review found (forgeable types, loose discovery
contracts, imprecise byte/escaping rules, symlink handling left implicit,
missing boundary tests) before implementation starts, rather than after.

## 1. Reuse M4's `FileTree` representation as-is; validate via a constructor
   function, not a type brand

`module3PLAN.md`'s file layout planned a `domain/tree/types.ts` defining
"immutable FileTree/FileContent values", but M4 already shipped both:
`FileContent` in `domain/content/types.ts`, and `FileTree =
ReadonlyMap<string, Uint8Array>` in `domain/tree/change.ts` (a plain alias —
Maps can't be branded via the intersection trick used for
`Version`/`ContributorId`, and M4 already made that deliberate choice). Per
the one-canonical-implementation rule, M3 reuses this exact type rather than
defining a second, incompatible `FileTree`. M3's actual invariant enforcement
(tracked-path syntax validity, prefix-free-ness, no duplicate paths) lives in
a validating constructor, `domain/tree/construct.ts: constructFileTree`, the
only place M3 code builds a `FileTree` from untrusted input. `TrackedPath` is
still branded (`domain/tree/path.ts`), the same forgeable-primitive gap
`module1REVIEW.md` flagged for `Version`. `domain/tree/types.ts` is dropped
from the file layout.

## 2. Working-tree scan root/exclusion contract, pinned explicitly

- The scan root is the *discovered repository root*, not `cwd`.
- Only a `.snap` directory that is the *first path segment from the root* is
  excluded — a nested `docs/.snap/file` is ordinary tracked content.
- Empty directories are never listed, including a directory that is empty
  only because everything under it was itself excluded.
- A symlink, FIFO, socket, device, or any other non-regular entry is rejected
  via `entryKind` without a second stat and without following it, with the
  exact diagnostic `snap: unsupported working tree entry: <path>\n` where
  `<path>` is the `/`-separated tracked-path form.

Covered by `test/node-working-tree-adapter.test.ts`: entry at scan root;
entry nested; a bare nested directory named exactly `.snap` (tracked, not
excluded); a multi-level empty directory tree (invisible); a symlink to a
missing target and a symlink to a real file/dir (both rejected identically).

## 3. Repository-publish byte/atomicity contract, pinned precisely

Canonical serialization is two-space indent + one trailing LF. Publication
writes a uniquely-named temporary file in the same `.snap/` directory,
durably flushes it (open + write + `filehandle.sync()` + close, not a plain
`writeFile`), then renames it onto `repository.json` (`fs.rename`, which uses
`MOVEFILE_REPLACE_EXISTING` on Windows so overwrite works cross-platform —
verified with a real-filesystem test on this Windows dev host, not assumed
from POSIX experience). A best-effort cleanup removes the temp file on a
failure path where that is safe. The existing `repository.json` is never
deleted or replaced before the new file is fully written, synced, and closed.
`test/repository-publication.test.ts` includes a failure-injection test using
a fake `FileSystemPort` that throws only on the rename step, and asserts the
original `repository.json` bytes are unchanged — the direct M3 analogue of
scenario 08's "no mutation on a failed attempt" assertion, tested at the
adapter/application boundary rather than only inferred from the public
scenario passing.

## 4. One shared commit-message validator

SPEC §4.2's message rule (nonempty UTF-8, tab/LF allowed, no other ASCII
control character; `commit` additionally caps user-supplied messages at 4096
UTF-8 bytes) has one owner: `domain/repository/message.ts: validateMessage`.
`domain/repository/schema.ts` calls it with no byte cap when decoding a
patch's `message` field (a generated revert message may exceed 4096 bytes,
though M3 does not generate revert patches). The `commit` use case calls it
with a 4096-byte cap for the user-supplied message and maps any failure to
the exact SPEC §7.5 diagnostic `invalid commit message`, discarding the
underlying detail. `test/repository-message.test.ts` covers the exact
4096/4097-byte boundary.

## 5. `log` escaping order, pinned to the exact scenario golden

Escape backslash first (`\` → `\\`), then tab (`\t`), then LF (`\n`) — in
that order, so escaping LF does not double-escape a backslash the tab/LF step
just introduced. `test/log-command.test.ts` uses
`snap/tests/04-commit-status-log.yaml`'s own commit message
`"first\tline\nsecond\\tail"` (a literal tab, LF, and backslash) and its
exact expected escaped log line as a literal fixture, not a hand-rolled
example.

## 6. Plain-mode `log` has no blank line between entries

SPEC §7.11 (terminal/ANSI mode, M7) adds "one additional LF between them";
SPEC §7.4 (plain mode, M3) and scenario 04's exact expected stdout show
records back-to-back with no blank separator. The M3 plain renderer does not
anticipate M7's spacing rule. `test/log-command.test.ts` asserts no blank
line appears between two consecutive plain-mode log records.

## 7. Multi-author, single-repository serial commits are tested

SPEC's data model allows `.snap/config.json` to be reconfigured to a
different contributor ID between commits, so one repository can accumulate
commits from more than one author without merge ever being involved.
`test/commit-command.test.ts` verifies that the frontier update after
`commit` sets/advances only the *authoring* contributor's component and
leaves every other component untouched — implied by SPEC §4.2 but not
directly covered by scenarios 03-06/08/25.

## 8. The linear-history validator's name/exports are kept distinct from M5's

`LinearRepository` (already defined in the pre-existing
`domain/repository/types.ts`) and `validateLinearRepository` /
`materializeLinearRepository` (`domain/repository/linear-history.ts`) are
never named or exported in a way that could be mistaken for M5's eventual
arbitrary-causal `ValidatedRepository`. A comment at `LinearRepository`'s
definition site cross-references exactly what M5 adds on top of it
(arbitrary causal-graph closure, exact-base validation under concurrency,
replay/OT). No unchecked cast or fallback parser is exported.

## 9. `status`'s A/M/D classification is a separate, lighter comparison than
   `commit`'s change construction

M4's `selectAuthoredChanges` returns full `AuthoredChange` values (computed
text edit scripts / base64 payloads) — more work than `status` needs, since
`status` only prints `A`/`M`/`D` codes. `domain/tree/compare.ts` is a
lighter byte-equality-only delta used by `status` and by the working-tree
`diff`'s dirty-check path; `commit` is the only caller of M4's
`selectAuthoredChanges`. Two different consumers, two different-shaped
outputs from the same pair of trees.

## Revised M3 completion check

M3 is complete only when the original exit gate and these corrections are
both satisfied:

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

Record the exact commands and results before marking M3 `Complete` in
`modules.md`. If `./snap/verify` cannot spawn on this Windows host (as M1 and
M2 both recorded), say so explicitly and name the exact commands to re-run on
a compatible host/CI rather than marking `Complete` on internal tests alone.
