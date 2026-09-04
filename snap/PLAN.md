# Snap implementation plan

This plan turns the specification and the language-neutral acceptance suite into
an implementation sequence for the TypeScript edition. The specification remains
the behavioral authority; this plan describes architecture, ownership, and order
of work rather than replacing any normative rule.

## Technical constraints

- Production code uses TypeScript and Node.js built-in APIs only. Tooling and type
  packages may remain development dependencies.
- Strict TypeScript is required. Untrusted input begins as `unknown` and becomes a
  domain value only after complete validation.
- Public behavior is process-level and byte-exact. Every invocation starts a new
  process, so durable state lives on disk and correctness cannot depend on caches.
- All text output uses explicit LF endings. Path and message whitespace is data and
  must never be trimmed or normalized.
- Determinism, validation-before-mutation, and cross-implementation repository
  compatibility take priority over optimization.

## Architecture

Snap will use a functional-core, imperative-shell design with one-way dependencies:

```text
CLI and HTTP interfaces
          |
          v
Application use cases --------> Output presentation
          |
          +--------------------> I/O ports
          |                          ^
          v                          |
Pure domain engine             Node.js adapters
```

The domain engine has no filesystem, process, environment, terminal, or network
access. Application use cases coordinate domain operations through explicit I/O
ports. Node adapters implement those ports. The interface layer parses requests
and renders outcomes but does not contain domain decisions.

### Domain engine

The domain engine owns immutable, deterministic value transformations:

- contributor IDs, revisions, vector clocks, causal comparison, joins, and Snap
  order;
- byte-exact prefix-free trees and canonical unsigned UTF-8 ordering;
- text classification, LF-retaining tokenization, edit validation/application,
  and canonical diff generation;
- patches, causal history, known-version selection, ready-patch scheduling, and
  deterministic materialization;
- text operational transformation, namespace resolution, whole-path conflict
  rules, and warning facts.

There must be exactly one implementation of each canonical operation. In
particular, commit, displayed diff, revert, validation, and OT must share the same
tree comparison, text tokenizer, and canonical diff. Replay order used by merge,
validation, and log must come from the same scheduler.

### Validation boundary

Repository and configuration input is untrusted. Decoding proceeds in ordered
stages:

1. Parse JSON with duplicate-key detection.
2. Enforce exact schemas and reject unknown fields.
3. Validate primitive values, safe-integer bounds, canonical ordering, paths,
   messages, base64, tokens, and edit operations.
4. Validate patch sorting, unique dots, contiguous contributor revisions,
   reachability, exact causal closure, and patch base transitions.
5. Reject missing dependencies and cycles.
6. Materialize every patch's exact base and validate change preconditions,
   effects, prefix freedom, and non-no-op behavior.
7. Replay the declared frontier to prove reproducibility.

Only fully validated domain values may cross this boundary. Same-dot patch
identity is structural equality of parsed values, never equality of JSON bytes.

### Application use cases

Each command is an independently testable use case. It receives typed arguments
and ports, invokes domain operations, and returns a semantic result or an expected
typed error. It does not print directly.

Mutating use cases follow a prepare/apply model:

```text
load -> validate -> compute -> check cleanliness -> prepare complete mutation
                                                        |
                                                        v
                                           update working-tree bytes
                                                        |
                                                        v
                                      atomically publish repository metadata
```

All parsing, validation, collision checks, replay, and target-tree construction
finish before the first write. Commit publishes metadata only because its target
bytes are already in the working tree. Merge and revert apply working files first
and publish metadata only after that succeeds.

### Node.js adapters

Adapters own all effects:

- upward repository discovery and local repository loading;
- duplicate-aware JSON input and canonical JSON output;
- working-tree scanning without following symlinks or special entries;
- binary-safe file reads, tree materialization, file/directory transitions, and
  empty-directory cleanup;
- same-directory temporary metadata writes, flush, close, and atomic replacement;
- local/global configuration and environment access;
- exact one-request HTTP repository loading without redirects;
- loopback HTTP serving, immutable startup snapshots, and graceful signals;
- stdout/stderr writing and TTY capability queries.

Local and HTTP repository sources share the same decoder and validator after bytes
are loaded.

### Interface and presentation

Argument parsing is a strict grammar. Unknown, missing, duplicate, misplaced, and
extra arguments fail before a use case runs. Expected errors are mapped centrally
to stderr and exit code 1; unexpected failures map to exit code 2.

Commands return semantic output records. A dedicated renderer converts them to
plain or terminal presentation. Presentation cannot change repository effects,
warning selection, ordering, or exit status. stdout and stderr terminal capability
is evaluated independently, while the server startup URL is always plain.

## Multi-agent execution model

Four roles keep ownership clear:

1. **Integration lead** — maintains architecture contracts, command use cases,
   CLI dispatch, presentation, integration, and the full regression gate.
2. **Causal model and validation owner** — owns version algebra, domain schemas,
   strict decoding, causal closure, known versions, and validation staging.
3. **Content and replay owner** — owns tree/content algebra, canonical diff, edit
   scripts, replay, OT, conflict rules, convergence, and warning facts.
4. **Platform boundary owner** — owns repository discovery/persistence, working
   tree operations, configuration storage, HTTP adapters, signals, and mutation
   safety.

Before parallel implementation begins, the team agrees on domain types, error
categories, ordering helpers, and port interfaces. An agent owns a concept
end-to-end; no second implementation of ordering, diff, parsing, tree comparison,
or replay is permitted. Changes integrate in small milestone-sized increments,
with the relevant unit and acceptance checks run before handoff. The integration
lead reviews dependency direction and runs the combined gate after every merge.

Major architectural or behavioral decisions are recorded in the decision log.
Routine implementation details are not.

## Module tracker and progress control

[`modules.md`](modules.md) is the required live coordination ledger for this plan.
It turns the milestones below into assignable modules and records each module's
status, owner, latest verification, dependencies, and handoff note. This separation
is important: the plan stays a stable architectural roadmap, while the module
tracker gives every agent an accurate view of active and completed work.

Every implementation or review agent must inspect the tracker before starting.
When taking a module, the agent sets it to `In Progress`, assigns an owner, and
records the immediate objective. At handoff, the agent records completed work,
remaining work, and the exact verification last run. `Complete` is permitted only
after the full exit gate passes. `Blocked` must name a concrete blocker and the
action required to clear it.

The module tracker is the only progress ledger. Do not duplicate status in this
plan, personal notes, or another tracking document. Architectural or milestone
changes are made here first and then reflected in the tracker; routine progress
updates change the tracker only.

## Milestones

The proposed nine milestones are sound as an overall shape, with dependency
corrections reflected below. The numbers identify stable work packages rather than
a strictly linear order: after M1, M2 and the pure M4 core may proceed in parallel,
and M3 integrates both. A public suite is a module exit gate only when every
command used by that suite exists; otherwise its underlying rules are covered by
focused internal tests and the complete public scenario is explicitly deferred.

| Milestone | Target scope | Verification gate |
| --- | --- | --- |
| **M1: Foundations, Clock Algebra, CLI Shell, and Init** | Establish architecture contracts, canonical unsigned UTF-8 ordering, version parsing/formatting, four-way comparison, join, Snap order, typed errors, strict top-level dispatch, repository discovery needed by initialization, and empty repository creation. | Public initialization scenarios 01 and 02; internal algebra tests for all version laws and boundaries. Public scenario 21 is deferred because it also requires commit, merge, and diff. |
| **M2: Configuration and Identity** | Strict configuration decoding/writing, local-over-global precedence, unavailable home handling, contributor ID validation, and identity resolution for authoring commands. Configuration setters replace the supported shape even when old content is malformed. | Internal configuration and identity tests. Public scenario 03 is deferred to M3 because it invokes commit to prove precedence. |
| **M3: Working Tree and Linear History** | Integrate M2 and M4 with byte-exact tree scanning, metadata exclusion, empty-directory handling, unsupported-entry rejection, clean/dirty comparison, status classification, basic strict repository decoding, linear-history materialization, patch creation, working and historical diff, commit, and canonical log ordering/escaping. | Public scenarios 03, 04, 05, 06, 08, and 25. Scenario 15 is developed incrementally here but is not a complete exit gate until full replay validation exists. |
| **M4: Canonical Diff and Content Algebra** | As a pure core that may proceed alongside M2: text detection, LF-preserving tokenization, edit-script validation/application, exact dynamic-programming recurrence with delete-on-tie, text/binary change selection, unified diff records, missing-final-newline handling, and byte preservation. | Internal golden and algebra tests for repeated lines, empty text, CRLF, Unicode, invalid UTF-8, NUL bytes, under/over-consumption, and operation coalescing. Public scenarios 05 and 06 close in M3 after commit can create their histories. |
| **M5: Full Validation, Deterministic Replay, and OT** | Complete closure and graph validation, exact-base semantic validation, ready-patch scheduling, deterministic replay, aggregate-context OT, namespace resolution, ordered whole-path conflict rules, warning deduplication/sorting, and convergence properties. | Public strict-validation scenarios 15, 23, and 27; internal replay/OT matrix and permutation tests. Public merge-driven scenarios 10, 11, 17, 18, and 22 are deferred to M6 even though their domain algorithms are completed here. |
| **M6: Merge and Revert** | Patch-set union, frontier join, typed dot-collision checks, net-new warnings, idempotent local merge, additive revert patches, known-version resolution, clean-tree refusal, complete mutation planning, and safe materialization. | Public scenarios 07, 09, 10, 11, 16, 17, 18, 19, 20, 21, and 22. These collectively prove merge direction/association convergence, all conflict rules, collision safety, vector-clock joins, version boundaries, OT, and revert behavior. |
| **M7: CLI Hardening and Presentation** | Complete the grammar matrix for every command, exact output channels and exit codes, semantic plain rendering, ANSI terminal rendering, color-environment precedence, independent TTY selection, stable version output, and whitespace preservation. | Public scenarios 14 and 24 plus internal renderer and TTY/non-TTY matrices. Public scenario 28 closes in M8 because it starts the HTTP server. |
| **M8: Embedded HTTP and Remote Repositories** | Immutable validated server snapshot, loopback binding, exact GET/HEAD resource, 404/405 behavior, clean signal shutdown, exact one-GET remote loading, no redirects, status handling, remote merge, observational remote diff, and final terminal/server integration. | Public scenarios 12, 13, 26, and 28. |
| **M9: Full Regression and Failure Safety** | Close all cross-milestone gaps, harden canonical boundaries, inject failures around prepared mutations, check portability and typed structural identity, and remove accidental duplication or dependency violations. | Re-run boundary scenarios 19, 25, 26, and 27, followed by the complete 01-28 suite from a clean install and a strict TypeScript build. |

## Testing strategy

### Pure unit tests

Use Node's built-in test framework through the existing TypeScript development
runner. Unit tests cover:

- version parse/format round trips, comparison outcomes, join laws, and ordering;
- unsigned UTF-8 ordering for ASCII, accented, emoji, and trailing-space paths;
- text classification, tokenization, edit validation/application, and canonical
  diff goldens;
- every OT table row, unequal-count splitting, trailing inserts, and coalescing;
- every path-level and namespace rule, including identical no-warning outcomes;
- causal readiness, exact-base selection, known versions, cycle/gap detection,
  warning set behavior, and deterministic replay.

### Adapter integration tests

Use isolated temporary repositories and loopback networking to test repository
discovery, configuration precedence, unsupported entries, binary-safe tree
materialization, file/directory transitions, atomic replacement, HTTP routing,
signal shutdown, and exact request behavior. Inject pre-publication failures to
prove metadata remains unchanged.

### Property tests

Use deterministic seeded generators built from Node APIs to create valid causal
patch graphs. Check that patch/import permutations preserve the joined frontier,
patch set, replayed bytes, and warning set. Check comparison and join laws
independently of command behavior.

### Public acceptance tests

The language-neutral harness remains the authoritative public gate. Run focused
scenarios during each milestone and the complete suite after major integrations.
Never modify the harness to compensate for missing candidate behavior.

## Milestone completion checklist

A milestone is complete only when:

- its domain invariants are unit-tested;
- its adapters have boundary and failure tests;
- its designated public scenarios pass without skipped assertions;
- the strict TypeScript build passes;
- production code introduces no non-built-in runtime dependency;
- no canonical operation has been duplicated in another layer;
- all expected failure paths preserve required state and output exact LF-terminated
  diagnostics; and
- the integration lead has reviewed architecture direction and updated the plan or
  decision log when a genuine design change was required.

## Project completion criteria

Snap is complete when all 28 public scenarios pass from a clean installation,
strict TypeScript passes, internal TTY and failure-injection coverage passes,
property checks demonstrate convergence, all repositories pass through the single
strict validation boundary, and merge/revert failures demonstrably avoid unintended
mutation.
