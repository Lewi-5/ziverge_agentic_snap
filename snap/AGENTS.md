# Snap — agent guidance

## Sources of truth

[`SPEC.md`](SPEC.md) is the canonical product contract. Public behavior must be
demonstrated in the language-neutral YAML suite under [`tests/`](tests/).
You may add language-specific unit tests while developing, but they cannot
replace the shared acceptance suite.

When implementation work reveals an ambiguity or contradiction, correct the
spec first or in the same commit and add a regression case to the public YAML
suite. Do not silently make the implementation authoritative.

## Implementation layout

Work in the language directory present at the project root. Keep responsibilities
separate: versions, text/diff and OT, repository validation and replay,
filesystem materialization, working-tree changes, HTTP, commands, and CLI
dispatch.

The YAML harness is implementation-language neutral. Never import reference
code into it or add shell setup operations to test around a missing typed
operation. Extend its tagged unions additively so existing format-1 cases keep
their meaning.

## Verification

After implementation changes, run the shared acceptance suite:

```bash
./capstones/snap/verify --lang ts
```

Replace `ts` with `rust` or `scala` when appropriate.


After harness changes, also run:

```bash
cd capstones/snap/test-harness
npm run check
npm test
```

## Committing work

Commit to git after finishing each major chunk of work — a completed command,
a completed layer (e.g. version algebra, replay/OT, filesystem
materialization, CLI dispatch), or a fix plus its regression test — not after
every small edit. Run the relevant verification (above) first and commit only
once it passes. Prefer several focused commits over one large one at the end
of a session.

## Scope discipline

Snap’s small surface is deliberate. Do not add branches, staging, checkout,
push, authentication, object storage, or unresolved-conflict machinery. Spend
complexity on deterministic behavior, strict validation, and exact tests—not
on production scalability or command count.

## Decision log

When implementing a major architectural, product, or behavioral decision,
append a brief bullet describing the decision to [`decisions.md`](decisions.md).
Add the note as part of the implementation work, keep it concise, and append it
at the bottom without rewriting or removing existing entries. Do not log routine
implementation details.
