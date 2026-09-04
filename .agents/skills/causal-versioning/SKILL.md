---
name: causal-versioning
description: >-
  Causal versioning, vector clocks, Snap total ordering, and dependency validation for Snap.
  Use when implementing or debugging vector clocks, version parsing/serialization, causal comparisons,
  DAG closure validation, or ready-patch scheduling.
---

# Causal Versioning & Vector Clocks

This skill provides the mathematical and architectural rules for Snap's causal version model as defined in `SPEC.md` §1, §3, and §4.

---

## 1. Contributor IDs & Revisions

- **Contributor ID:** ASCII email-shaped string with exactly one `@` (`alice@example.com`).
  - Must not contain control characters, whitespace, `,`, `(`, `)`, or `->`.
  - Max length: 254 bytes. Case and spelling must be strictly preserved (no normalization).
- **Revision:** Positive integer ($1 \le r \le 2^{53} - 1$, JavaScript `Number.MAX_SAFE_INTEGER`).
  - Revision 0 is invalid/omitted.
- **Serial Contributor Rule (§3.5):** Each contributor advances monotonically: revision $n$ has exactly one patch and immediately follows revision $n - 1$.
- **Dot Collision:** If import finds the same `(author, revision)` dot with structurally different patches, fail immediately with corruption before any mutation.

---

## 2. Canonical Version Syntax & Representation

### String Format (CLI & Display)
- Empty version: `()`
- Nonempty version: `(author1->rev1,author2->rev2)`
  - Contributors sorted strictly by **unsigned UTF-8 bytes**.
  - No spaces, no leading zeroes on revisions, no zero revisions.
  - CLI parser must strictly enforce this format; invalid ordering or spaces must error.

### JSON Representation (`repository.json`)
- Ordered array of `[id, revision]` 2-tuples:
  ```json
  [["alice@example.com", 2], ["bob@example.com", 1]]
  ```
- The spec's own example is sorted by unsigned UTF-8 bytes, matching the
  canonical CLI string form, and writers SHOULD emit it that way for
  consistency. **This is not explicitly stated as a MUST for the JSON array**
  the way it is for the CLI string form (§3.2) — the spec instead says "the
  parsed typed value — not its serialized bytes — is authoritative." Do not
  assume a reader must reject an otherwise-valid frontier/version array just
  because its `[id, revision]` pairs are out of order; treat this as a
  canonical-writer convention, not a validated invariant, unless testing
  against the acceptance suite shows otherwise.

---

## 3. Causal Algebra & Snap Order

Absent contributor entries have an implicit revision of 0.

### 4-Way Causal Comparison (§3.3)
Given versions $V$ and $W$:
- **Equal ($V = W$):** $\forall c, V[c] = W[c]$.
- **Before ($V < W$):** $\forall c, V[c] \le W[c]$ and $\exists c, V[c] < W[c]$.
- **After ($V > W$):** Converse of Before.
- **Concurrent ($V \parallel W$):** $V \ne W$, not $(V < W)$, and not $(W < V)$.

*Rule:* Preserve all four outcomes explicitly. Concurrency is not an ordering.

### Causal Join
$$\text{join}(V, W)[c] = \max(V[c], W[c])$$
Join is idempotent, commutative, and associative.

### Snap Order (Arbitrary Total Order for Serialization, §3.4)
Used only to order concurrent patches during replay:
1. Union all contributor IDs in $V$ and $W$, sorted by unsigned UTF-8 bytes.
2. Compare revisions lexicographically at each contributor ID.
3. The first unequal revision decides ($V < W$ if $V[c] < W[c]$).

---

## 4. Repository Validation & Causal Closure (§4.5)

Before using any repository, validate, in this order:
1. **Schema & Types:** Strict schema check; no unknown keys, no non-integer numbers, and every version/ID/path/message/change individually valid.
2. **Patch Dot Uniqueness & Contiguity:** Exactly one patch per `(author, revision)` dot; for author $c$, revisions must form a contiguous sequence $1, 2, \dots, \text{frontier}[c]$ with no gaps.
3. **Base Invariant & Closure:** Each patch's `base` is fully present in the patch set (every referenced dependency exists), and `revision = base[author] + 1`.
4. **Acyclic History:** Patch dependencies must form a Directed Acyclic Graph (DAG). No cycles allowed.
5. **Change-vs-base validity (§4.3) — do not skip this:** For every patch, check each change against its own *materialized exact base tree*, not just against the schema:
   - a `text` or `put` change that **creates** a file requires the path to be **absent** in that patch's exact base tree;
   - an **edit**, **replacement**, or **delete** requires the path to be **present** in the base tree;
   - a change that does not alter path existence or bytes is invalid — **except** that an empty text edit script (`[]`) may validly create an empty file.

   This step is easy to conflate with schema validation (step 1) but is
   materially different: it requires actually applying each change to its
   base tree and checking the precondition/effect, not just checking the
   change object's shape.
6. **Deterministic Replay of the Declared Frontier:** Actually run the §6.1 replay algorithm to materialize `frontier`. If no ready patch remains before every selected patch is integrated, the history has a cycle or a missing dependency the DAG check alone didn't catch — validation fails. This is a distinct, final check, not a restatement of step 4.

---

## 5. Topological Patch Selection (Ready Set, §6.1)

To materialize target version $V$:
1. Select all patches $(c, n)$ where $n \le V[c]$. Validate that the selected set contains the base closure for all selected patches.
2. Maintain a set of already-integrated patches (initially empty, version `()`).
3. Iteratively determine the **ready set**: patches whose complete base is already in the integrated set.
4. If the ready set is empty before all selected patches are integrated, fail (cycle or missing dependency).
5. Choose the **least ready patch** using this deterministic tie-breaker:
   1. Snap order of result version ($\text{base} \cup \{(\text{author}, \text{rev})\}$).
   2. Unsigned UTF-8 byte order of author.
   3. Numeric revision.
6. Integrate this patch and repeat.
