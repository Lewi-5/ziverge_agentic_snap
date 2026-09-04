# M9: Full Regression and Failure Safety

## Context

`snap/PLAN.md` defines M9 as the final integration and hardening milestone. It
depends on every earlier module and adds no product surface. Before starting,
read all tracker handoffs, confirm M1–M8 are genuinely `Complete`, and review
`snap/decisions.md` for architectural choices that must survive cleanup.

We are building **M9: Full Regression and Failure Safety**. The goal is to prove
that the assembled implementation behaves as one system: all 28 language-neutral
scenarios pass from a clean install, strict TypeScript/lint/tests pass, prepared
mutations preserve published metadata on failure, causal properties converge,
and no canonical operation or dependency boundary was duplicated during module
integration.

M9 is not a license to add features or reinterpret failures. When a regression
reveals an ambiguity or contradiction, correct `SPEC.md` first or in the same
change and add/update a language-neutral YAML regression. Routine fixes stay in
the owning module's layer; significant decisions are appended to
`snap/decisions.md`.

Behavioral authority: all of `snap/SPEC.md`, with special focus on §§1.1, 2,
3.5, 4.5, 6.5, 10, 11, and 12. Public exit gate: focused scenarios 19, 25, 26,
and 27, then the complete 01–28 suite from a clean dependency installation.

## Scope

### In scope

- Cross-module audit of version, identity, path, content, repository, replay,
  mutation, HTTP, grammar, and presentation boundaries.
- Remove duplicate canonical logic and accidental reverse/circular dependencies.
- Ensure production runtime imports only Node built-ins and project code.
- Deterministic failure injection around validation, tree application, temporary
  metadata writing/flushing/closing, and atomic replacement.
- Property tests for causal algebra, scheduler/replay convergence, set union,
  warnings, and import permutations.
- Portability regression for CRLF, Unicode, NUL/binary, base64, safe integers,
  structural typed identity, path ordering, and LF-only output.
- Exact clean-install build/lint/unit/integration/public verification.
- Documentation/ledger/decision-log reconciliation after evidence exists.

### Out of scope

- New commands or flags; branches, staging, checkout, conflict markers, push,
  writable HTTP, authentication, hashes, compression, locking, crash recovery,
  rollback, or power-loss durability.
- Optimizations that change canonical results or obscure validation order.
- Marking incomplete modules complete merely because failures are host-specific.

## Expected file impact

M9 should prefer tests and focused corrections over a new production subsystem:

```text
snap/ts/test/
  mutation-failure-injection.test.ts   [NEW/EXPAND]
  replay-properties.test.ts            [NEW/EXPAND]
  portability-boundaries.test.ts       [NEW/EXPAND]
  architecture-boundaries.test.ts      [NEW]
  cli-process-regression.test.ts        [NEW/EXPAND]
snap/ts/src/**                          [FIX only in owning layer]
snap/tests/*.yaml                       [ADD only for newly exposed public regressions]
snap/decisions.md                       [APPEND major decisions only]
snap/modules.md                         [verification/handoff ledger]
```

Do not create an M9 “utility” layer that becomes a second implementation of
existing behavior. Fix the canonical owner and point every consumer to it.

## Audit matrix

| Invariant | Canonical owner | Consumers to verify |
| --- | --- | --- |
| unsigned UTF-8 order | M1 domain helper | versions, paths, patches, changes, warnings |
| version construction/algebra | M1 version domain | repository decode, commit, merge, diff, revert |
| strict UTF-8/duplicate JSON | M2 JSON boundary | config, local repo, HTTP repo, tests |
| tree equality/path validation | M3 tree domain | status, cleanliness, diff, validation, mutation |
| tokenizer/edit/diff/coalescer | M4 content domain | commit, display, validation, OT, revert |
| scheduler/replay/conflicts | M5 history domain | validation, log, materialization, merge |
| typed patch equality/union | M5/M6 repository domain | merge, local/remote cross-repo diff |
| materialization/publication | M3/M6 ports/adapters | commit, merge, revert |
| grammar/results/rendering | M7 CLI boundary | every command including serve |
| repository-source validation | M5/M6/M8 source boundary | local/HTTP merge and diff, serve startup |

Use import/dependency tests or a simple source audit to enforce one-way layering
where practical. Domain code must not import Node/ports/application/CLI; adapters
must not contain domain decisions; commands must not duplicate parsing/replay.

## Key hardening work

### 1. Validation-before-observation and mutation

Every repository-consuming command validates the complete selected repository
before producing normal stdout. Status/log/diff/serve do not partially render a
malformed history. Cross-repository diff validates both sides and all shared dots
before any diff bytes.

For commit, validate inputs/current repository and construct/validate the final
document before the metadata temp write. For merge/revert, finish local/operand
validation, replay, collision/known-version checks, cleanliness scan, warning
selection, target tree, mutation plan, and final repository serialization before
the first write.

Add port spies that fail if a mutation method is invoked after any expected
validation failure. Public scenarios 15, 16, 20, 23, 26, and 27 provide
process-level evidence; internal tests cover stages the harness cannot inject.

### 2. Failure-injection matrix

Inject deterministic failures at:

- working-tree removal of an obsolete path;
- removal of a file/directory namespace blocker;
- parent-directory creation;
- first and later target-file writes;
- metadata temporary-file open/write;
- flush/sync;
- close;
- final same-directory rename; and
- server/client startup or response interruption where applicable.

Before any working mutation, failures leave tree and metadata unchanged. During
a multi-file merge/revert apply, the working tree may be partially updated, but
the old `repository.json` must remain byte-for-byte published and the command
must fail. A metadata temp/write/flush/close failure also leaves old metadata.
Rename success is the publication point. Clean up unpublished temp files when
safe, but do not implement rollback or claim stronger crash durability.

Commit never rewrites working files; publication failures leave its working tree
dirty relative to the old frontier so retry remains possible.

### 3. Causal and convergence properties

With deterministic seeds, generate small valid histories honoring the serial
contributor rule, exact bases, prefix-free trees, and valid authored changes.
Check:

- four-way comparison exclusivity and join idempotence/commutativity/association;
- Snap order totality/antisymmetry/transitivity and extension of causal order;
- every ready order places dependencies before dependents;
- repository storage permutations do not change materialized bytes/warnings;
- union/import direction and association produce the same frontier, typed patch
  set, tree, and warning set;
- repeated import is a no-op;
- every materializable version reproduces from empty state; and
- same-dot structural differences always fail before mutation.

Use bounded sizes/seeds so the suite is reliable and debuggable. On failure,
print/retain the seed in the unit-test diagnostic without changing CLI output.

### 4. Portability and canonical boundaries

Recheck these exact boundaries end-to-end:

- contributor IDs: ASCII, exact one `@`, prohibited characters/substrings,
  254-byte maximum, spelling preservation;
- revisions/counts: integer 1 through `Number.MAX_SAFE_INTEGER`; no zero,
  negatives, fractions, overflow, or leading zero in CLI versions;
- version arrays and CLI versions: canonical unsigned order, no duplicates;
- paths: UTF-8, `/`, no controls/backslash/empty/dot/dot-dot segments, reserved
  root `.snap`, prefix-free, no Unicode/case normalization;
- content: fatal UTF-8, NUL binary classification, CRLF preservation, empty and
  unterminated text, canonical padded base64;
- messages: nonempty, allowed tab/LF only among controls, 4096-byte commit limit,
  exact trailing spaces, correct log escaping;
- typed patch identity independent of JSON whitespace/object-key order;
- exact LF-only plain/terminal output and ANSI glyph/code placement; and
- exact one-GET remote behavior and immutable server snapshots.

Tests must construct byte payloads directly where host text APIs could normalize
them. Do not rely on locale or platform directory enumeration order.

### 5. Full command/failure matrix

For every command, verify accepted grammar, representative success, repository
discovery from a nested directory where applicable, expected error channel/exit
1, and an injected unexpected failure/exit 2. Confirm read-only commands never
mutate and config remains silent. Confirm `--version` and global config need no
repository, merge needs no identity, and only commit/revert resolve identity.

Recheck `SNAP_COLOR` before command execution, independent stdout/stderr TTY
selection, `NO_COLOR` presence including empty, and always-plain server URL.

### 6. Dependency and production audit

Run strict TypeScript and ESLint with zero warnings. Inspect `package.json` and
the production import graph: runtime code may use Node built-ins only and no dev
package at runtime. Remove dead scaffold/sample paths, duplicate helpers, and
unsafe `as` casts that bypass validated constructors. Ensure all discriminated
unions use exhaustive switches and all untrusted boundaries start from
`unknown`/bytes.

Do not remove user or unrelated work. Make cleanup changes in focused commits
owned by the affected module.

## Tests to add or consolidate

### Failure safety

- No mutation calls for grammar, invalid color, malformed config/repository,
  collision, unknown version, clean/no-op, dirty, and unsupported-entry errors.
- Ordered call traces prove tree application precedes metadata publication.
- Partial working-tree failures retain old repository bytes; retry behavior is
  understandable and no hidden automatic rollback occurs.
- Same-directory temporary paths, flush/close/rename order, and safe cleanup.

### Properties and regression

- Seeded causal graph/import permutations and small exhaustive version algebra.
- Differential canonical diff goldens over repeated short token sequences.
- OT matrix plus three-way convergence and all path/namespace warning rules.
- Local versus HTTP source equivalence for the same typed repository.
- Exact plain/terminal renderer snapshots and independent TTY capability pairs.

### Clean-install process verification

- Install from the lockfile, do not rely on pre-existing `node_modules`.
- Run build, lint, all unit/integration/property tests, then all YAML scenarios
  through the public launcher.
- Run from paths containing spaces and a nested repository cwd where supported.
- Record host-specific inability as a concrete blocker; do not substitute manual
  replay for a required automated gate when declaring final completion.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1–M8 completion evidence; set M9 `In Progress` with owner/objective;
     capture current clean-install baseline without changing product state.
1. **Architecture/canonical-owner audit**
   - Map imports and consumers, remove duplicate canonical operations, and add
     boundary tests.
2. **Validation and mutation audit**
   - Add spy/failure-injection coverage, then fix owning layers in small commits.
3. **Property and portability coverage**
   - Add deterministic generators and byte-exact boundary matrices; retain seeds
     on failures.
4. **Focused public regressions**
   - Run scenarios 19, 25, 26, and 27 and fix any cross-module issues.
5. **Clean full gate**
   - Reinstall locked dependencies and run strict checks, all internal tests,
     and public 01–28 without filters/skips.
6. **Final documentation and handoff**
   - Append only genuine architectural decisions, record exact versions/commands
     and results in `snap/modules.md`, and mark M9/project complete only after
     every criterion passes.

Commit after each completed audit/fix chunk, following `snap/AGENTS.md`.

## Verification

From the repository root, using a clean locked dependency installation:

```bash
npm --prefix snap/ts ci
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 19-version-boundaries
./snap/verify --lang ts --filter 25-config-version-path-boundaries
./snap/verify --lang ts --filter 26-portability-and-failure-safety
./snap/verify --lang ts --filter 27-history-canonicality
./snap/verify --lang ts
```

The final handoff records exact pass counts, property-test seeds/configuration,
platform, Node/npm versions, and any applicable cross-language exchange result.
Snap is complete only when all 28 public scenarios pass unfiltered from the clean
install, strict TypeScript/lint and all internal tests pass, mutation failure
injection preserves the specified publication boundary, and the architecture
audit finds no duplicate canonical logic or non-built-in production dependency.
