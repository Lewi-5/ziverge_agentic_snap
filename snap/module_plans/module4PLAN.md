# M4: Canonical Diff and Content Algebra

## Context

`snap/PLAN.md` defines M4 as a pure core that depends only on M1 and may be
implemented in parallel with M2. M3 cannot complete until M4 is complete. Read
M1's handoff and corrections first so this module reuses the established
unsigned UTF-8 comparator, immutable result/error types, and semantic
presentation boundary.

We are building **M4: Canonical Diff and Content Algebra**. M4 owns the one
definition of text, line tokenization, edit-script validation/application,
canonical minimum diff, file change selection, and semantic unified-diff
records. Commit, displayed diff, repository validation, revert, and OT must all
call this core rather than implementing local variants.

Canonicality is the product feature here. A merely minimal diff is insufficient:
repeated lines must follow the specification's deletion-on-tie walk exactly.
Likewise, JavaScript string conveniences must not normalize CRLF, replace
malformed UTF-8, or turn binary data into text.

Behavioral authority: `snap/SPEC.md` §§2, 4.3–4.4, 5, 7.5–7.6, and 10. M4 has
an internal exit gate. Public scenarios 05 and 06 close in M3 after commit and
the diff command exist; scenario 22 later exercises the same edit algebra
through OT.

## Scope

### In scope

- Immutable file-content and token value types that preserve exact bytes.
- Strict text classification: valid UTF-8 bytes with no NUL.
- LF-retaining tokenization and canonical reconstruction.
- Strict edit-operation/schema validation, coalescing, complete consumption,
  and application.
- The exact §5 dynamic-programming recurrence and deletion-on-tie walk.
- Canonical base64 encoding/decoding helpers for `put` changes.
- Complete-tree comparison and deterministic selection of `text`, `put`, and
  `delete` authored changes.
- Semantic whole-file diff records for text/binary changes, absent sides, and
  missing-final-newline markers.
- Pure unit and golden tests, including repeated-line tie cases.

### Out of scope

- Working-tree traversal, repository I/O, commands, and metadata publication
  (M3).
- Repository graph validation, ready scheduling, replay, and OT (M5), although
  M5 consumes M4's edit functions directly.
- ANSI styling (M7). M4 produces semantic records/plain logical lines, never
  escape sequences.

## File layout (`snap/ts/src/`)

```text
domain/
  content/
    types.ts                  [NEW] immutable text/binary and token types
    classify.ts               [NEW] fatal UTF-8 + NUL classification
    tokenize.ts               [NEW] LF-retaining split/join
    base64.ts                 [NEW] strict padded RFC 4648 codec
  edit/
    types.ts                  [NEW] retain/delete/insert discriminated unions
    construct.ts              [NEW] invariant-preserving edit constructor
    apply.ts                  [NEW] complete edit application
    coalesce.ts               [NEW] single canonical operation coalescer
    canonical-diff.ts         [NEW] exact DP recurrence and tie walk
  tree/
    change.ts                 [NEW] text/put/delete types and selection
    diff-records.ts           [NEW] semantic unified/binary records
cli/
  render-diff-plain.ts        [NEW or M3 integration] exact LF rendering only
test/
  content-classify-tokenize.test.ts
  base64.test.ts
  edit-construct-apply.test.ts
  canonical-diff.test.ts
  change-selection.test.ts
  diff-records.test.ts
```

If M3 establishes the tree directory first, place the files under that shared
domain area. Do not duplicate types or algorithms to preserve this exact
spelling.

## Layering and value rules

- All M4 production code is pure and imports no Node APIs, ports, application,
  or CLI dispatch.
- Bytes are copied or treated as immutable at public construction boundaries;
  callers cannot mutate a validated content value through a retained buffer.
- Text decoding is fatal. Never call a replacement-decoding path for content
  classification.
- The canonical edit constructor is the only public way to create a validated
  edit. Repository decoders in M3/M5 and generated diffs both use it.
- Coalescing is implemented once and reused by diff and OT. Validation rejects
  adjacent same-kind operations received from disk; generation coalesces them.
- Semantic diff records retain their prefixes and token bytes so M7 can style
  them without reparsing or changing plain output.

## Key behaviors

### 1. Text classification and tokenization

A file is text only when all bytes decode as valid UTF-8 and no byte is NUL.
The empty byte sequence is text. Preserve decoded spelling exactly; do not
normalize Unicode or line endings.

Split immediately after every LF and retain that LF in the token:

```text
"a\r\nb" -> ["a\r\n", "b"]
"a\n"     -> ["a\n"]
""         -> []
```

Every token is nonempty. Every token except possibly the final token ends in
LF, and no token contains an earlier LF. Joining tokens must reconstruct the
original UTF-8 bytes exactly.

### 2. Edit-script validation and application

Operations are exact one-key objects:

- `{retain: n}` and `{delete: n}` use positive safe integers;
- `{insert: tokens}` uses a nonempty array of valid nonempty text tokens.

Reject unknown fields, multiple operation keys, zero/fractional/unsafe counts,
empty inserts, invalid token sequences, and adjacent operations of the same
kind. The script must consume every old token exactly: under-consumption and
over-consumption are distinct expected validation failures. There is no
implicit trailing retain.

An empty script is valid only for creation of an empty text file. It is not a
valid edit of a present file because that would not consume its base, and a
change that leaves a present file unchanged is a forbidden no-op.

Application walks the validated script once, checks consumption defensively,
and returns a canonical token sequence. It never mutates the base tokens or
operation arrays.

### 3. Canonical diff

For old tokens `A` of length `n` and new tokens `B` of length `m`, implement the
exact recurrence from `SPEC.md` §5:

```text
D(n,m) = 0
D(i,m) = n-i
D(n,j) = m-j
equal:    D(i,j) = D(i+1,j+1)
different D(i,j) = 1 + min(D(i+1,j), D(i,j+1))
```

Walk from `(0,0)`: retain equal tokens; otherwise delete when
`D(i+1,j) <= D(i,j+1)` and insert only when insertion is strictly cheaper;
finish the exhausted side; then coalesce. Do not substitute an ordinary LCS or
library diff whose repeated-line tie behavior has not been proven identical.
An optimized algorithm is allowed only with differential goldens proving the
same script.

### 4. Canonical base64

`put.content` uses standard padded RFC 4648 base64. Decoding rejects invalid
alphabet, whitespace, missing or misplaced padding, noncanonical pad bits, and
any spelling whose decode/re-encode result differs. Encoding arbitrary bytes
produces the canonical padded form. Browser/Node convenience decoders that
silently ignore junk are not validation.

### 5. Authored change selection

Compare two prefix-free trees by sorted path union. For each changed path:

1. New path absent -> `delete`.
2. New bytes are text and old is absent or text -> `text` using the canonical
   token diff.
3. Otherwise -> `put` with canonical base64.

This means a binary-to-valid-text replacement remains `put`, while a
text-to-text edit and absent-to-empty-text creation use `text`. A new empty
text file is encoded with an empty edit. Unchanged paths produce no change.
Changes sort by unsigned UTF-8 path bytes and the complete result is nonempty
when used for a patch.

### 6. Semantic unified diff

For every changed path, emit one semantic block. If both sides are text (or one
side is absent and the present side is text), use:

```text
--- a/<path> | --- /dev/null
+++ b/<path> | +++ /dev/null
@@ -1,<old-count> +1,<new-count> @@
 <retained-token>
-<deleted-token>
+<inserted-token>
```

Emit operations in canonical-script order. For every displayed token without a
final LF, append one output LF and then the marker:

```text
\ No newline at end of file
```

The marker belongs immediately after that old/new/context token. If either
present side is binary, emit exactly one binary notice and no text block:

```text
Binary files <old-label> and <new-label> differ
```

Use `/dev/null` for an absent side. Equal files emit no record. Logical output
uses explicit LF only; do not use platform newline helpers.

## Golden and algebra tests

### Text/content tests

- Empty, LF-terminated, unterminated, CRLF, lone CR, multi-line Unicode, and
  supplementary-code-point content.
- Malformed UTF-8 families, including truncated, overlong, surrogate, and
  out-of-range encodings; any NUL makes content binary.
- Token invariants and exact byte round trips without normalization.
- Canonical base64 accept/reject matrix and arbitrary-byte round trips.

### Edit tests

- Every valid operation type, mixed scripts, full delete, full insert, and
  empty-file creation.
- Unknown/multiple keys, zero/fraction/overflow counts, empty inserts, invalid
  token boundaries, adjacent same-kind operations, under-consumption, and
  over-consumption.
- Coalescing preserves order and merges counts/token arrays without mutating
  inputs.
- Apply(diff(A,B), A) equals B across a deterministic corpus.

### Canonical diff goldens

- The public repeated-line case `a,b,a -> b,a,a` yields delete, retain 2,
  insert—not another equally minimal script.
- Insert/delete ties prove deletion priority at the first differing cursor.
- Empty-to-empty, empty-to-text, text-to-empty, repeated identical tokens,
  unequal lengths, CRLF, Unicode, and unterminated final tokens.
- A small reference recurrence test enumerates short token sequences and checks
  minimum cost, complete consumption, canonical tie choice, and round trip.

### Change/diff-record tests

- Every text/put/delete selection boundary, especially binary-to-text and empty
  text creation.
- Sorted multi-path output using ASCII, accented, emoji, nested, and
  trailing-space paths.
- Create/delete headers, empty-file hunk, binary notice, one or both
  missing-final-LF markers, and zero output for equal trees.
- Exact plain goldens from public scenarios 05, 06, 21, 26, and 28 without
  requiring their command workflows.

## Order of implementation

0. **Preflight and ownership**
   - Confirm M1 is complete and no concurrent owner is changing shared version
     or ordering contracts.
   - Set M4 `In Progress` with owner/objective in `snap/modules.md`.
1. **Content values**
   - Implement immutable bytes, strict classification, tokenization, and
     canonical base64 with focused tests.
2. **Edit algebra**
   - Add edit types, validation, coalescing, and apply; establish exact error
     categories needed by the repository decoder.
3. **Canonical recurrence**
   - Implement the DP matrix/walk and exhaustive short-sequence goldens.
4. **Tree change selection**
   - Add one pure current-to-target change builder shared by commit/revert.
5. **Diff records and plain rendering contract**
   - Build semantic records and exact plain goldens while preserving an M7
     styling seam.
6. **Completion and handoff**
   - Record exact verification and the exported contracts M3/M5 must use.

Commit after each completed layer, following `snap/AGENTS.md`.

## Verification

```bash
npm --prefix snap/ts run check
npm --prefix snap/ts run test:unit
```

M4 is complete when all content/edit/diff goldens and algebra tests pass, M1
regressions remain green, production code has no runtime dependency, and the
handoff explicitly identifies the single APIs M3 uses for patch creation and
displayed diff. Scenarios 05 and 06 remain deferred until M3 provides their
process-level workflow.
