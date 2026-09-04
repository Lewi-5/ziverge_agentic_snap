# Lessons Learned from Snap

## Purpose and sources

This document is a retrospective on the design and implementation of Snap, a small version-control system built around vector clocks, immutable patches, deterministic replay, operational transformation, and byte-exact command behavior.

The conclusions below come from the complete project trail: [`SPEC.md`](SPEC.md), [`PLAN.md`](PLAN.md), [`modules.md`](modules.md), [`decisions.md`](decisions.md), every document under [`module_plans/`](module_plans/), the Git commit history, the 28 language-neutral YAML acceptance scenarios under [`tests/`](tests/), the TypeScript unit/integration/property tests under [`ts/test/`](ts/test/), and the final uncommitted audit corrections present when this retrospective was written.

The specification and executable tests are treated as authoritative. Plans, progress notes, and the decision log are valuable records of intent, but several describe intermediate states that were later corrected. That is itself one of the project's lessons: historical documentation must be interpreted as a timeline, not as a substitute for the current contract.

## Executive summary

The project succeeded because it treated determinism, validation, and observable behavior as architectural concerns rather than last-minute polish. The most important lessons were:

1. **Separate causal order from deterministic total order.** Vector clocks describe causality; Snap order exists only to make concurrent replay deterministic. Confusing the two would have broken the model.
2. **Canonical behavior must have one owner.** One UTF-8 comparator, one tokenizer, one canonical diff, one replay scheduler, one repository validation boundary, and semantic renderers prevented commands from drifting apart.
3. **Validation is replay, not merely schema checking.** A repository is not trustworthy until every patch can be applied to its exact causal base and the declared frontier can be reproduced.
4. **Conflict rules are ordered algorithms.** Namespace handling, identical-result collapse, text OT, and whole-file rules must run in the specified sequence. Reordering individually sensible rules changes the result.
5. **The filesystem is part of the state machine.** Symlinks, file/directory transitions, empty directories, atomic metadata publication, and partial-write behavior were as important as the pure history model.
6. **Presentation is public behavior.** Argument grammar, error precedence, exit codes, stdout/stderr routing, LF endings, ANSI bytes, TTY selection, and the timing of server output all required exact tests.
7. **Examples prove cases; properties prove laws.** Golden tests caught formatting and tie-breaking errors, while permutation and associativity tests were needed to support convergence claims.
8. **A failing verifier may implicate the harness or host.** Windows process and FIFO behavior produced real harness failures that had to be separated carefully from product defects.

## How the implementation evolved

The nine-module decomposition was effective because each milestone established contracts needed by the next:

| Milestone | Main contribution | Most important learning |
| --- | --- | --- |
| M1 | Version algebra, ordering, CLI shell, discovery, init | Foundational types and extension seams must be correct before features accumulate. |
| M2 | Strict JSON/configuration and identity | Untrusted input needs a real trust boundary; `JSON.parse` alone was insufficient. |
| M3 | Working tree, linear history, commit/status/log/diff | Filesystem and byte semantics must be explicit, and temporary abstractions must be clearly named. |
| M4 | Text/binary content algebra and canonical diff | Deterministic output depends on tiny choices such as LF retention and delete-on-tie. |
| M5 | Full validation, replay, OT, conflict rules | Schema validity is weaker than causal and semantic validity. |
| M6 | Merge, revert, union, materialization | Pure planning followed by controlled effects makes complex mutation auditable. |
| M7 | Complete grammar and terminal presentation | CLI parsing and rendering should be centralized, semantic, and independently testable. |
| M8 | HTTP server and remote repositories | Transport should acquire bytes, not reinterpret repository semantics. Long-running commands need lifecycle-aware output. |
| M9 | Architecture, failure, portability, and property audit | Cross-module defects often appear only after the happy paths are complete. |

The Git history also shows the value of focused commits. Major concepts landed separately—configuration, canonical diff, working-tree scanning, full replay, merge/revert, presentation, HTTP, architecture enforcement, failure injection, and portability. This made later corrections attributable and reviewable.

## 1. Architecture and specification-driven design

### What worked well

The functional-core/imperative-shell architecture matched the problem extremely well. Versions, trees, edits, patches, replay, conflicts, and warnings remained pure. Filesystem, environment, terminal, network, signals, and output lived behind ports and Node adapters. Application use cases coordinated the two without printing directly.

That separation made difficult rules testable without constructing a real repository for every case. For example, OT stream behavior, path winner rules, warning subtraction, tree mutation planning, and causal scheduling could be tested as deterministic functions, while focused adapter tests covered symlink detection, atomic rename, HTTP routing, and signals.

The project also made semantic results the boundary between execution and rendering early. That decision paid off in M7: terminal presentation could be added without changing commit, merge, status, or diff semantics.

### Where challenges arose

The first review found that the architecture was sound in outline but still porous in details:

- `Version` was structurally forgeable, allowing invalid or mutable vectors into functions that assumed invariants.
- A platform-specific `@esbuild/linux-x64` dependency undermined portability.
- Repository discovery could accept or traverse symlinks.
- Test TypeScript was not initially type-checked.
- M1 had been marked complete before its public gate ran.

Later, M9 found a genuine dependency inversion: a repository-source adapter called into the application layer and a port imported an application type. The program worked, but the dependency graph no longer matched the intended architecture. Moving source classification to the port side, composition to the application side, and adding `architecture-boundaries.test.ts` converted an architectural convention into an executable rule.

Shared-working-tree development created additional integration pressure. Progress notes record concurrent edits to shared repository types and M5 replacing M3's temporary linear-history boundary while other work was active. Clear module ownership helped, but ownership alone did not eliminate the need for explicit reconciliation commits.

### Main takeaway

Architecture is not preserved by directory names or diagrams. Enforce it with nominal types, narrow constructors, import-boundary tests, and one canonical implementation of each rule. When parallel work is expected, agree on shared types and ports first and schedule explicit reconciliation after integration.

## 2. Vector clocks, causal history, and deterministic scheduling

### What worked well

The implementation kept three related ideas distinct:

- A **vector clock** answers whether versions are equal, before, after, or concurrent.
- A **causal join** takes the componentwise maximum and represents the union frontier.
- **Snap order** is an arbitrary total order used only to serialize concurrent replay.

This distinction prevented concurrency from being incorrectly treated as chronology. The ready-set scheduler first honored complete bases, then chose the least ready patch by result-version Snap order, author byte order, and revision. The same scheduler was reused for materialization and log ordering, avoiding two subtly different histories.

The model also correctly treated a version as a causal frontier rather than a commit identifier. Tests covered known versions that are valid joins even when no patch has that exact result vector. Revert could therefore target any known causal version, not only a displayed log entry.

Patch identity was another strong decision. A dot `(author, revision)` identifies a patch, but duplicate dots are accepted only when their parsed typed patch values are structurally equal. JSON whitespace and object-key order are irrelevant; a different base, message, change, or content is corruption. Cross-repository diff performs this collision check even though it does not import patches.

### Where challenges arose

The serial-contributor rule is simple to state but reaches into validation, merge safety, and identity configuration. Contiguous revisions are not enough: each patch's base must contain the prior author revision and its complete transitive dependencies. Missing transitive closure was important enough to receive a dedicated regression test.

Storage order also had to be separated from causal order. Repository JSON requires canonical patch ordering, while replay itself had to converge even when white-box property tests deliberately shuffled the in-memory patch array. Testing only sorted repositories would have hidden scheduler dependence on input order.

### Main takeaway

Distributed-history code needs separate representations for partial order, join, and deterministic serialization. Do not overload one comparison operation. Validate closure independently of presentation order, and test replay against deliberately permuted storage.

## 3. Repository validation and trust boundaries

### What worked well

The strongest part of the project is its layered validation pipeline:

1. Fatal UTF-8 decoding.
2. Duplicate-aware JSON parsing.
3. Exact schema and primitive validation.
4. Canonical ordering, dot uniqueness, revision contiguity, reachability, closure, and base-transition checks.
5. Cycle/readiness validation.
6. Materialization of each patch's exact base.
7. Change precondition, effect, edit, and prefix-free validation.
8. Deterministic replay of the declared frontier.

The opaque `ValidatedRepository` boundary means application commands cannot accidentally treat decoded-but-unverified data as safe. Local files, remote HTTP bodies, and newly prepared commit/merge/revert documents all converge through the same validation path.

M2's strict JSON work illustrates why general-purpose parsers are not always enough for an interoperable format. `JSON.parse` silently accepts duplicate keys by keeping the last value, so the project implemented a parser that detects duplicates at every depth, including escape-equivalent names. It also handled `__proto__` as an ordinary own data property without prototype mutation, and schemas required exact own keys.

### Where challenges arose

M3 initially needed a smaller validator to deliver linear history before full causal replay existed. Naming it `LinearRepository` and explicitly documenting that M5 would supersede it was a good containment strategy. The later reconciliation removed the staged boundary rather than allowing two validators to coexist indefinitely.

Several bugs lived beyond schema shape:

- A text edit against a binary base must fail even when the edit object is structurally valid.
- Retain/delete operations must consume exactly the old token sequence.
- A resulting token sequence must itself be canonical.
- A delete of an absent path is invalid against the patch's exact base, regardless of what another concurrent patch later creates.
- No-op changes are invalid except for empty-text creation by an empty edit.

These cases demonstrate why “valid JSON” and even “valid patch shape” are far from “valid repository.”

### Main takeaway

For event-sourced or patch-based systems, validation often requires executing the history. Build explicit intermediate types for each trust stage, expose only the fully validated type to consumers, and revalidate generated state before publication.

## 4. Text, binary content, canonical diff, and byte preservation

### What worked well

The content model made byte preservation primary:

- Text means valid UTF-8 with no NUL byte.
- Tokenization splits immediately after LF and retains the LF.
- CRLF is data inside a token, not a newline style to normalize.
- A missing final LF is represented by the final unterminated token.
- Empty text has zero tokens.
- Everything else is binary and uses canonical padded RFC 4648 base64.

The canonical diff implementation followed the specified dynamic-programming recurrence exactly, including deletion on equal-cost ties. That small tie-break matters for repeated lines: two minimum edit scripts may transform the file correctly, but only one is interoperable across implementations.

One shared diff fed patch creation, displayed diff, and OT context generation. One coalescer enforced the rule against adjacent operations of the same kind. Semantic diff records then separated the diff algorithm from plain and ANSI rendering.

### Where challenges arose

The edge cases were more important than the ordinary ones:

- Under- and over-consumption of the old sequence.
- Empty scripts being valid only for creating an empty file.
- Inserts containing invalid token boundaries, NULs, or unpaired surrogates.
- Canonical base64 padding bits, not merely decodable base64.
- New/deleted-file hunk headers using the specified one-based form.
- Missing-final-newline markers on either side.
- Correct `text` versus `put` selection when replacing binary content with text.

The exhaustive short-corpus diff test was particularly valuable: it checked minimality, completeness, coalescing, and round-trip application rather than relying only on hand-picked goldens.

### Main takeaway

Interoperable diff formats require canonical algorithms, not merely equivalent results. Define text at the byte boundary, preserve newline bytes exactly, make tie-breaking normative, and test both golden outputs and algebraic round trips.

## 5. Replay, operational transformation, and conflict resolution

### What worked well

The replay design correctly materialized each incoming patch against two trees:

- `B`, the patch's exact authored base.
- `C`, the canonical tree containing `B` plus earlier concurrent effects.

That made aggregate-context OT possible. Instead of transforming an edit once per historical patch, Snap computes `Q = diff(B, C)` and transforms the authored edit through that single aggregate context. Cursor-based operation streams handled unequal counts without expanding operations token by token.

The ordered dispatch was crucial:

1. Resolve patch-wide namespace conflicts.
2. Apply directly when `B` equals `C` at the path.
3. Collapse identical `C` and authored target `T` before OT.
4. Use text OT only when all relevant contents are text.
5. Otherwise apply the ordered whole-path winner rules.

Warnings were modeled as structured facts, not strings. Replay deduplicated and sorted `(path, reason)` pairs; merge emitted only `joinedWarnings - localWarnings`. This supported idempotent re-merge without re-reporting old conflicts.

### Where challenges arose

Every stage had tempting but incorrect shortcuts:

- Running per-path rules before namespace resolution could leave a non-prefix-free tree.
- Failing to remove authored deletions before namespace analysis could emit false `namespace-wins` warnings.
- Skipping the identical-result check could duplicate concurrent text inserts.
- Giving incoming inserts priority over context inserts would reverse canonical order.
- Letting delete operations consume concurrently inserted tokens would lose independent work.
- Treating whole-file rules as an unordered set would change winners and warning reasons.

The regression suite records these failures directly: incoming descendant versus current ancestor, delete-versus-edit, text-versus-binary, identical concurrent creates, split operation counts, trailing inserts, and three concurrent text patches.

The property-test history provides another lesson. The original three-way associativity fixture used only concurrent atomic creates, so it proved associativity mainly through `later-create-wins`. A later audit added fixtures for `delete-wins`, `later-put-wins`, `put-wins`, and `namespace-wins`, and exercised all six three-operand order/grouping combinations. A property test is only as broad as the behaviors generated by its fixtures.

### Main takeaway

Conflict resolution is an ordered state-transition algorithm, not a bag of policies. Encode each phase separately, preserve structured warning identity, and verify convergence across directions, association orders, storage permutations, and every conflict family.

## 6. Merge, revert, filesystem materialization, and failure safety

### What worked well

Merge was kept mathematically small: validate both repositories, reject unequal common dots, take patch-set union, join frontiers, revalidate, replay, check cleanliness, materialize, and publish. It authors no patch and needs no contributor identity. This naturally supports idempotence, commutativity, and associativity.

Revert was correctly modeled as a forward operation. It materializes a known historical target, computes current-to-target changes, and authors a new patch on the current frontier. History is never deleted and the frontier never moves backward.

The prepare/apply mutation model was another success. Merge and revert fully compute the target repository, target tree, warnings, and mutation plan before the first write. Working files are applied before repository metadata. Metadata is written to a same-directory temporary file, flushed, closed, and atomically renamed. Failure-injection tests verified that a working-tree failure leaves the old `repository.json` byte-identical, accepting the specified possibility of a partially updated dirty tree rather than inventing an incomplete rollback protocol.

Working-tree scanning also respected the security boundary: scan from the repository root, exclude only the root `.snap`, use `lstat`-style classification, reject symlinks/FIFOs/sockets/devices, and never follow unsupported entries.

### Where challenges arose

File/directory transitions required deliberate ordering: remove blocking files, prune empty parents, create required parents, then write target bytes. The tests covered both `a` → `a/b` and `a/b` → `a`, metadata-path protection, path escape prevention, symlinks, FIFOs, sockets, and failures during application.

A final audit still found a subtle gap: empty directories are ignored and therefore may exist in a clean working tree, but the materializer rejected an empty directory when a merge needed to write a file at that same path. The current working tree contains a correction that verifies the directory subtree is truly empty, removes it, and adds adapter plus end-to-end merge regressions. This is a useful example of a mismatch between two individually reasonable rules—“empty directories are untracked” and “do not overwrite directories”—that appeared only when the rules were composed.

### Main takeaway

Treat filesystem state as a first-class part of the model. Test the Cartesian product of tracked state, actual disk entry kind, and target state. Prepare all semantic work before mutation, publish metadata last, and state clearly which partial failures are accepted.

## 7. CLI grammar, output, and terminal presentation

### What worked well

Snap treated its CLI as a protocol. The final design has one strict grammar parser for all commands, semantic command results, centralized exit handling, and separate plain/terminal renderers. Plain mode is byte-stable; terminal mode is a precisely specified alternate representation.

Tests covered unknown, missing, extra, duplicate, and misplaced arguments; exact diff usage errors; port bounds; contributor/message/path whitespace; stdout/stderr separation; and exit codes 0, 1, and 2. Presentation tests covered all four stdout/stderr TTY combinations, `SNAP_COLOR` precedence over `NO_COLOR`, exact ANSI sequences, trailing spaces, and the requirement that color is not the only signal.

### Where challenges arose

Before centralization, the diff command partly re-parsed its own arguments. That drift caused real scenario 24 failures and was corrected by routing it through the shared grammar AST. Other regressions captured important precedence rules: invalid versions before dirty-tree checks, dirty revert before the already-current error, collision checking before cross-repository version operands, and invalid `SNAP_COLOR` before command execution.

Log output exposed another small but important detail: plain mode has adjacent lines, while terminal mode adds blank lines. Message escaping must replace backslashes before tabs and LFs. These are easy to get “visually right” while producing the wrong bytes.

### Main takeaway

Do not let handlers parse or print opportunistically. Parse once into a typed request, execute into semantic records, and render per stream. Test exact bytes and error precedence because callers observe them just as surely as file contents.

## 8. HTTP repositories and long-running command lifecycles

### What worked well

The network boundary stayed intentionally narrow. The HTTP client performs one GET, follows no redirects, requires status 200, and returns bytes. Those bytes enter the same repository decoder and validator as local files. Merge and cross-repository diff are transport-neutral after source loading.

The server validates once, serializes one immutable startup snapshot, binds only loopback, and serves a single exact resource. GET, HEAD, 404, 405, `Allow`, content type, zero-byte HEAD body, query rejection, and snapshot immutability all received direct tests.

### Where challenges arose

`--serve` did not fit the ordinary “return a completed outcome, then print it” command model. The startup URL is a readiness signal and must be written and flushed while the server is still running. Buffering it until the command resolved would deadlock the acceptance harness. Adding an output port and awaiting the startup write solved a lifecycle problem without pushing sockets or process I/O into the domain layer.

Shutdown also needed idempotence, listener cleanup, and defensive close behavior. These concerns were easiest to test through injected signal and server ports, then confirm end-to-end on POSIX.

### Main takeaway

Transport adapters should acquire and deliver bytes; shared application/domain code should own meaning. Long-running commands need an explicit lifecycle model with readiness output, steady state, and shutdown—not just a promise that eventually returns.

## 9. Testing strategy and harness lessons

### What worked well

The layered test strategy was one of the project's greatest strengths:

- **Pure unit tests** covered algebra, parsers, tokenization, edits, diff, OT, conflict rules, scheduling, and warnings.
- **Adapter tests** exercised actual filesystem, terminal, HTTP, and signal boundaries.
- **Application/process tests** verified command orchestration, error precedence, and non-mutation guarantees.
- **Property tests** checked replay and union invariants across deterministic seeds and permutations.
- **Language-neutral YAML scenarios** tested the public executable with no imports from the TypeScript implementation.
- **Architecture tests** checked dependency direction and canonical-logic ownership.

The acceptance harness's typed operations were a good design choice. Avoiding arbitrary setup shell commands made tests portable, confined, and easier to diagnose. Exact filesystem and HTTP assertions made the suite much more than a collection of CLI snapshots.

The final recorded gate was strong: strict build/lint passed; the compiled internal suite discovered 442 tests, with 434 passing and eight expected POSIX-filesystem skips on native Windows; the public suite passed 28/28 on WSL/POSIX. Native Windows reliably completed 24/28 after harness hardening.

### Where challenges arose

The harness itself required production-quality debugging:

- Windows could not directly spawn shebang scripts, producing `EFTYPE`; the harness learned to resolve the interpreter.
- Sandbox path validation initially used host path behavior where POSIX-style test paths were intended.
- Killing chained wrapper processes on Windows sometimes never produced a `close` event, causing indefinite cleanup waits; completion and cleanup were bounded after a confirmed `taskkill`.
- Native Windows cannot deliver real POSIX SIGTERM/SIGINT semantics to the child process used here.
- MSYS `mkfifo` creates an emulation that native Node reports as a regular file, so FIFO tests require POSIX/WSL.
- The `tsx` launcher hit a host-specific `uv_os_get_passwd ENOMEM` failure, requiring emitted-JavaScript test runs.

The right response was not to weaken Snap to satisfy a broken fixture. The team reproduced failures outside the harness, improved genuine harness defects, documented platform ceilings, and retained POSIX as the authoritative release gate.

Generated-test artifacts also required discipline. The emitted-JavaScript workaround briefly produced a large temporary tree that later had to be removed in a reconciliation commit. Temporary verification output should always be placed outside tracked paths or covered by explicit cleanup and ignore rules.

### Main takeaway

Test infrastructure is software and can fail independently. Triangulate failures at the domain, adapter, process, harness, and host layers before changing product behavior. Keep a platform that can exercise the full contract as the release gate, and document lesser-platform smoke-test expectations precisely.

## 10. Planning, reviews, and documentation

### What worked well

The combination of a stable implementation plan, a live module tracker, correction documents, progress handoffs, and focused commits worked better than a single continuously rewritten plan would have. The correction documents are especially valuable because they preserve why contracts changed:

- M1 corrections tightened discovery, grammar, nominal version construction, canonical JSON, and presentation seams before downstream modules relied on them.
- M3 corrections reconciled its plan with M4's actual APIs and pinned scanner, publishing, message, log, and staged-validation behavior.
- M6 and M8 handoffs explained which seams later modules should extend instead of rewriting.
- M9 converted accumulated assumptions into architecture, failure, portability, process, and property tests.

The discipline of not marking modules complete until their exit gates ran also prevented internal-unit confidence from being mistaken for public compliance.

### Where challenges arose

Historical notes sometimes became stale as parallel work landed. Some progress documents correctly describe an earlier incomplete state that no longer exists. The decision log is useful for intent but should not be read without checking the current spec and tests. A few summaries also compress rules too aggressively; for example, contributor IDs are more general than a narrow alphanumeric regex, and grammar errors are expected exit-1 failures in the final contract.

### Main takeaway

Keep three roles distinct:

- The specification defines behavior.
- Tests provide executable evidence.
- Plans, decisions, and progress notes explain intent and history.

Retrospectives should reconcile all three rather than copying any single source. When a historical document is intentionally retained, label obsolete state clearly.

## What should be repeated on a similar project

1. Write normative algorithms for every result that must be cross-language deterministic.
2. Establish branded/validated domain constructors before feature work.
3. Centralize byte ordering, parsing, canonicalization, replay, and rendering early.
4. Use temporary typed stages when necessary, but name and retire them explicitly.
5. Keep transport and filesystem effects behind narrow ports.
6. Compute complete mutations before applying them and publish authoritative metadata last.
7. Combine golden examples, exhaustive small cases, failure injection, and property tests.
8. Add architecture tests before integration drift occurs, not only after discovering it.
9. Make every property fixture prove that it reaches the intended branch or conflict rule.
10. Run authoritative gates on a host capable of expressing the contract, while keeping other hosts as useful smoke tests.
11. Preserve correction documents and focused commits; they are more educational than a polished final snapshot alone.
12. Perform a final spec-to-code audit even after all tests pass. The empty-directory materialization gap demonstrates why this remains worthwhile.

## Final perspective

Snap's small feature surface made its deeper lesson visible: correctness in distributed and stateful tools is rarely about one clever algorithm. It comes from composing many precise contracts—causal algebra, canonical bytes, validation, replay order, conflict policy, filesystem behavior, command grammar, output timing, and failure semantics—without allowing any layer to quietly reinterpret another.

The project worked best when those contracts were centralized and tested at multiple levels. Its hardest moments occurred at boundaries: decoded data becoming trusted history, causal history becoming a materialized tree, a pure target tree becoming filesystem mutations, semantic results becoming exact terminal bytes, and a long-running process becoming testable across operating systems. Those boundaries are where future projects should spend the most design and verification effort.
