# M5: Full Validation, Deterministic Replay, and OT

## Context

`snap/PLAN.md` defines M5 as the point where repository input becomes fully
validated for arbitrary causal histories. M5 depends on completed M1, M3, and
M4. Before implementation, read their tracker handoffs and confirm M3 clearly
distinguishes decoded/linear repository values from the final validated type.

We are building **M5: Full Validation, Deterministic Replay, and Operational
Transform**. This module completes repository validation, known-version
selection, deterministic ready-patch scheduling, exact-base materialization,
aggregate-context text OT, namespace conflict resolution, path-level winner
rules, and warning facts. It is a pure domain milestone except for integrating
the final validator into M3's repository-loading boundary.

M5 does not add `merge`; M6 exposes these rules through merge/revert and owns
mutation. Public scenarios 15, 23, and 27 can close through the existing
`status` command because every loaded repository must pass the complete
validator before status scans or prints anything. Merge-driven scenarios 10,
11, 17, 18, and 22 remain M6 gates.

Behavioral authority: `snap/SPEC.md` §§1, 3.3–3.5, 4, 5, 6, 7.3, and 10.
Public exit gate: scenarios 15, 23, and 27 plus internal OT/conflict/convergence
tests.

## Scope

### In scope

- Complete exact repository schema and typed-value construction.
- Canonical version-array, patch-array, and change-array ordering validation.
- Unique dots, contiguous per-author revisions, exact frontier reachability,
  base closure, patch result transitions, missing-dependency, and cycle checks.
- Materialization of any locally known causal version from the empty tree.
- Exact-base semantic validation for every patch/change.
- Deterministic ready-set scheduling with all tie breakers.
- Aggregate-context text OT with every stream-pair and split/end case.
- Patch-wide namespace resolution before per-path decisions.
- Ordered path-level conflict rules and sorted/deduplicated warning facts.
- Seeded convergence/property tests over valid causal patch graphs.
- Replacing M3's staged linear validator at all repository-loading boundaries
  with one exported `ValidatedRepository` constructor.

### Out of scope

- Patch-set union, merge warning subtraction, local cross-repository diff,
  additive revert, and disk materialization (M6).
- CLI grammar/presentation hardening (M7).
- HTTP repository sources (M8).

## File layout (`snap/ts/src/`)

```text
domain/
  repository/
    types.ts                         [MOD] opaque/validated repository values
    schema.ts                        [MOD] complete exact schema decoder
    structural-equality.ts           [NEW] parsed patch equality by typed value
    validate.ts                      [NEW] ordered full validation pipeline
    index.ts                         [NEW] dot lookup and per-author revision index
    known-version.ts                 [NEW] selection and closure proof
  history/
    patch-result.ts                  [NEW] base + authored dot transition
    ready-scheduler.ts               [NEW] deterministic topological order
    materialize.ts                   [NEW] exact version replay from empty tree
    integrate-patch.ts               [NEW] B/C/T integration pipeline
    warnings.ts                      [NEW] WarningFact set/order helpers
  ot/
    transform.ts                     [NEW] transform incoming edit through context
    operation-stream.ts              [NEW] count splitting/cursor helpers
  tree/
    namespace-conflicts.ts           [NEW] patch-wide prefix collision resolution
    path-conflicts.ts                [NEW] ordered whole-path winner rules
application/
  repository/load-local-repository.ts [MOD] require full validator only
test/
  repository-schema.test.ts
  repository-validation.test.ts
  known-version.test.ts
  ready-scheduler.test.ts
  materialize.test.ts
  ot-transform.test.ts
  namespace-conflicts.test.ts
  path-conflicts.test.ts
  replay-convergence.test.ts
```

Names may follow existing conventions, but scheduling, canonical diff,
coalescing, path ordering, and replay must each have exactly one implementation.

## Layering and validation boundary

- Schema decoding accepts `unknown` and produces only decoded immutable domain
  candidates. Full semantic validation produces the opaque
  `ValidatedRepository` used by commands.
- Validation and replay are pure. They consume domain bytes/trees/patches and
  return typed results plus warning facts; they do not read files or print.
- M4's tokenizer, edit validator/application, canonical diff, content
  classifier, and coalescer are mandatory dependencies. OT must not duplicate
  them.
- Version comparison/join/Snap order and unsigned UTF-8 ordering come only from
  M1.
- Memoization may improve one invocation but cannot be required for correctness.
  Cached trees are immutable and keyed by validated canonical versions.
- Every local repository consumer is switched to the full loader in this module;
  no command retains a “trusted because Snap wrote it” shortcut.

## Key behaviors

### 1. Ordered validation pipeline

Validate before a repository is used, in these explicit stages:

1. Fatal UTF-8 decode and duplicate-aware JSON parse.
2. Exact object schemas: reject unknown/missing fields and wrong variants.
3. Primitive/domain invariants: `format === 1`; ASCII IDs; positive safe
   revisions/counts; canonical version arrays; messages; paths; canonical
   base64; token sequences; one-key edit operations; nonempty inserts; and
   non-adjacent operation kinds.
4. Collection invariants: `patches` sorted author then numeric revision,
   changes nonempty/sorted/unique by path, unique dots, and contiguous author
   revisions.
5. Frontier reachability: patches are exactly the causal closure of frontier;
   reject both missing selected patches and unreachable extras.
6. Base/result invariants: every base dependency exists, every patch has
   `revision = base[author] + 1`, and its result changes only that component.
7. Acyclic/readiness proof: schedule all selected patches; an exhausted ready
   set before completion is cyclic or incomplete history.
8. Exact-base semantics: materialize each patch's exact base, validate each
   create/edit/replace/delete precondition, complete edit consumption,
   non-no-op effect, and prefix-free authored result.
9. Replay the declared frontier with the same scheduler/integrator used by all
   materialization and prove reproducibility.

Do not infer a valid graph merely from array order. Do not treat JSON byte/key
order as patch identity; object-key order and whitespace disappear during
typed decoding. Conversely, array order is semantically constrained where the
spec requires patches/changes and the acceptance suite requires canonical
version components.

### 2. Known versions and patch selection

A syntactically valid vector is known when every selected dot `(c,n)` with
`n <= V[c]` exists and the selected set contains every selected patch's entire
base closure. It need not equal the repository frontier or a patch result.

Reject a component beyond available history, a missing lower revision, or a
vector that selects a patch while omitting one of its dependencies. Selection
is by contributor counter, not by taking an array prefix. The empty version is
always known in a valid repository and materializes the empty tree.

### 3. Ready-patch scheduler

Start from no integrated dots. A selected patch is ready when every dot in its
complete base is integrated; already integrated concurrent dots do not make it
unready. Recompute or update the ready set after each integration.

Choose the least ready patch by:

1. Snap order of the patch's result version;
2. unsigned UTF-8 author order; then
3. numeric revision.

Dependencies therefore always precede dependents, while concurrent patches get
one deterministic total order. `log`, validation, materialization, and merge
must consume this scheduler rather than sorting separately.

### 4. Exact-base semantic validation

For each patch, independently materialize its exact base `B` and apply its
authored changes directly to `B` (without concurrent context):

- `text`/`put` creation requires absence;
- text edit, put replacement, and delete require presence;
- a text edit requires text base bytes and complete token consumption;
- the authored target must differ in existence or bytes, except `edit: []` may
  create an empty text file;
- all changes apply against the same `B` and form one simultaneous prefix-free
  target tree.

This validation is not replaced by successful joined replay. A change that only
happens to make sense after a concurrent patch is invalid.

### 5. Integrating one patch

For incoming patch `P`, materialize its exact base tree `B`; let `C` be the
canonical tree built so far, containing `B` plus earlier concurrent effects.
Compute each changed path's authored result `T` from `B`. All decisions for the
patch observe the same immutable `B` and pre-patch `C`; do not mutate `C`
path-by-path.

Resolve namespace conflicts for the patch as a whole first. Then, for every
unsettled changed path, use this order:

1. If `B[path]` and `C[path]` are identical, apply the authored change.
2. If `C[path]` and `T[path]` are identical, keep it with no warning.
3. If `B`, `C`, and `T` are text and `P` is a text change, use aggregate OT.
4. Otherwise use the ordered whole-path rules.

Apply the resolved removals/installations simultaneously to form the next
prefix-free canonical tree.

### 6. Namespace conflicts

Let `S` be paths the incoming patch makes present. Let `C'` be `C` after
removing every path the patch authored as a deletion. For each `p` in `S`, if
`C'` contains a different ancestor or descendant:

- install `p` as its authored target `T`;
- remove every conflicting current path; and
- add `(removedPath, namespace-wins)`.

Authored results have already been validated prefix-free. Collapse duplicate
removals and warning pairs. Namespace decisions override OT/path-level rules
for settled incoming paths.

### 7. Aggregate-context operational transform

For a text path, compute `Q = canonicalDiff(B, C)` once. Transform incoming
authored edit `P` through `Q` left-to-right, splitting counts as required:

| Next operations | Output | Consumption |
| --- | --- | --- |
| `Q insert` | `retain(length(Q insert))` | Q only |
| `P insert` | same insert | P only |
| `P retain`, `Q retain` | `retain(min)` | both |
| `P delete`, `Q retain` | `delete(min)` | both |
| `P retain`, `Q delete` | nothing | both |
| `P delete`, `Q delete` | nothing | both |

`Q insert` has priority even when `P insert` is also next, so earlier canonical
insertions precede later ones. Deletes consume only base tokens; concurrent
insertions survive. Continue through trailing inserts until both streams end;
no unmatched retain/delete is legal. Coalesce with M4's helper and apply once
to `C`. Text OT emits no warning.

### 8. Whole-path rules and warnings

For remaining paths, use this exact rule order:

1. `C === T`: keep current, no warning.
2. `T` absent: incoming delete wins, `delete-wins`.
3. `B` present and `C` absent: earlier concurrent delete wins,
   `delete-wins`.
4. `B` absent and both present: incoming canonical-later create wins,
   `later-create-wins`.
5. Incoming change is `put`: incoming replacement wins,
   `later-put-wins`.
6. Incoming text versus non-text current: current wins, `put-wins`.

Warnings are immutable `(path, reason)` facts, deduplicated and sorted by path
then reason using unsigned UTF-8 comparison. Replay returns the complete set;
it does not print and does not decide which warnings a future merge displays.

## Tests to write

### Schema and validation matrix

- Duplicate keys at every depth; exact repository/patch/change/edit schemas;
  wrong `format`; non-integer and unsafe numbers; invalid IDs/messages/paths;
  canonical base64 and token invariants.
- Canonical frontier/base component order and uniqueness, patch author/revision
  order, change path order, duplicate dots/paths, revision gaps, unreachable
  patches, missing dependencies, wrong author transition, cycles, and closure.
- Exact-base create/edit/replace/delete preconditions, under/over-consumption,
  no-op values, empty text creation exception, and prefix conflicts.
- Mirror every case in public scenarios 15, 23, and 27 with focused domain
  assertions, including their diagnostic substrings/patterns.

### Scheduler and known-version tests

- Empty, linear, branching, concurrent, and reconverged DAGs.
- Result Snap-order ties followed by author/revision tie breakers.
- Every dependency precedes its patch; storage permutations do not affect the
  integration order.
- Known non-frontier vectors, known non-patch-result vectors, omitted closure,
  excessive counters, and empty version.

### OT and conflict tests

- Every table row, both unequal-count split directions, adjacent output
  coalescing, simultaneous/trailing insertions, malformed unmatched streams,
  and no input mutation.
- Identical concurrent text changes collapse before OT.
- Overlapping deletes, retained token deleted by context, context insert
  surviving incoming delete, insert priority, and three concurrent text
  patches matching scenarios 18/22.
- Every whole-path rule, exact precedence between rules, identical no-warning
  outcomes, text/binary combinations, and sorted/deduplicated warnings.
- Namespace ancestor/descendant collisions in both directions, patch-authored
  deletion before collision detection, multiple conflicting descendants, and
  simultaneous installation.

### Property tests

Use a deterministic seeded generator for small valid causal graphs and patch
sets. Across storage/import permutations, assert identical selected scheduler
order, frontier tree bytes, warnings, and patch identities. Also assert that
materializing the exact result version of each patch includes its complete
causal closure and that replay never depends on caches or input array order.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1, M3, and M4 complete; set M5 `In Progress` with owner/objective.
1. **Final types, schema, and indexes**
   - Complete exact decoding, structural equality, dot indexing, canonical
     collection checks, and immutable validated constructors.
2. **Known versions and scheduler**
   - Implement selection/closure and one ready-set scheduler with DAG tests.
3. **OT core**
   - Implement split stream cursors and the complete transform matrix using M4
     coalescing/application.
4. **Conflict integration**
   - Add namespace resolution, per-path dispatch, whole-path rules, simultaneous
     tree updates, and warning facts.
5. **Exact-base materialization and semantic validation**
   - Use the completed integrator to reproduce arbitrary causal bases, validate
     authored patch results, and replace M3's staged loader with the full
     boundary.
6. **Convergence and command integration**
   - Run property permutations and ensure status/log/diff all load through the
     full validator and scheduler.
7. **Completion and handoff**
   - Record exact gates and the replay/union contracts M6 consumes.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
./snap/verify --lang ts --filter 15-repository-validation
./snap/verify --lang ts --filter 23-strict-validation-matrix
./snap/verify --lang ts --filter 27-history-canonicality
```

Also run the M3 public scenarios because their repository loader changes to the
full validator. Mark M5 complete only after the three public gates, all OT and
convergence tests, strict checking, and regression scenarios pass. Do not claim
merge-driven scenarios 10, 11, 17, 18, or 22 until M6 exposes the engine.
