---
name: operational-transform
description: >-
  Operational Transformation (OT) matrix, replay engine, deterministic conflict resolution, and merge warnings for Snap.
  Use when implementing patch replay, text OT transformation, path conflict rules, namespace collisions, or merge warning diffing.
---

# Operational Transformation & Conflict Resolution

This skill details deterministic patch integration, OT text transformation, path-level winner rules, and merge warning tracking according to `SPEC.md` §6.

---

## 1. Replay Engine Architecture (§6.2)

For each ready incoming patch $P$:
1. Materialize $P$'s exact base tree $B$.
2. Let $C$ be the current canonical tree built so far (starting from the empty tree at version `()`).
3. First, resolve **namespace conflicts** for the patch as a whole.
4. For remaining paths, apply either **text OT** or **path-level rules**.
5. Form the next canonical tree by applying all resolved changes together.

---

## 2. Namespace Conflict Resolution (§6.2)

File/directory collisions must be resolved before per-path evaluation:
- Let $S$ be the set of paths that $P$ makes present (created or modified).
- Let $C'$ be $C$ minus all paths that $P$ authored as deletions.
- If any path $p \in S$ has an ancestor or descendant in $C'$ (e.g. $P$ creates `a` but $C'$ contains `a/b`, or vice-versa):
  - Mark the incoming path $p$ for installation as authored result $T$.
  - Mark every conflicting path in $C'$ for removal.
  - Emit one warning for each removed path: `(<removed-path>, namespace-wins)`.
- Author results are prefix-free; duplicate removals and warnings collapse.

---

## 3. Per-Path Dispatch (§6.2)

For each path changed by $P$ that the namespace step (§2) did not already settle,
evaluate against the same $B$ (patch's base) and $C$ (current canonical tree),
where $T$ is the authored result of applying $P$'s change to $B$, **in this
exact order**:

1. **Base match:** If the path is identical in $B$ and $C$ (nobody else
   touched it concurrently), apply $P$'s authored change to $C$ directly. No
   diff or transform needed.
2. **Already-applied match:** If the path is identical in $C$ and $T$, keep
   $C$ unchanged. This collapses identical concurrent changes *before* OT so
   their effect is never duplicated — do not fall through to OT or path-level
   rules in this case.
3. **Text OT:** If $B$, $C$, and $T$ are all text and $P$ is a text change,
   go to §4 below.
4. **Otherwise:** go to §5 below (path-level rules).

Rule 2 is easy to miss and easy to get wrong: it must be checked, and must
short-circuit, before any OT transform is attempted.

## 4. Operational Transformation (OT) for Text (§6.3)

When $B$, $C$, and authored target $T$ are all text, and $P$ is a text change:
1. Compute the aggregate context edit $Q = \text{diff}(B, C)$ using §5.
2. Transform $P$ through $Q$ by walking both operation streams from left to right, splitting counts as necessary:

| Next Operations in Streams | Transformed $P$ Output | Stream Consumption |
| :--- | :--- | :--- |
| **`Q insert`** | `retain(length(Q insert))` | $Q$ only |
| **`P insert`** | same `P insert` | $P$ only |
| **`P retain`, `Q retain`** | `retain(min)` | both ($P$ and $Q$) |
| **`P delete`, `Q retain`** | `delete(min)` | both ($P$ and $Q$) |
| **`P retain`, `Q delete`** | *nothing* | both ($P$ and $Q$) |
| **`P delete`, `Q delete`** | *nothing* | both ($P$ and $Q$) |

### Key OT Invariants:
- **Insert Priority:** `Q insert` has strict priority over `P insert`. Concurrent inserts at the same cursor appear in canonical integration order ($Q$'s inserted tokens precede $P$'s).
- **Base Consumption:** Deletions only consume base tokens; concurrently inserted text is preserved.
- **Coalescing:** Coalesce adjacent identical operations in the transformed output script.
- **No Warning:** Line-level OT produces no warning facts.

---

## 5. Path-Level Conflict Resolution (§6.4)

For non-text changes or incompatible types, evaluate base $B$, current canonical $C$, and incoming authored result $T$ in this exact order:

1. **Identical:** If $C = T$, keep $C$ and emit no warning (collapses identical concurrent edits).
2. **Incoming Delete:** If $T$ is absent $\rightarrow$ incoming delete wins: `delete-wins`.
3. **Concurrent Delete:** If $B$ is present and $C$ is absent $\rightarrow$ earlier delete wins: `delete-wins`.
4. **Concurrent Create:** If $B$ is absent, and both $C$ and $T$ are present $\rightarrow$ incoming (canonically later) create wins: `later-create-wins`.
5. **Incoming Put:** If incoming change is `put` $\rightarrow$ incoming atomic replacement wins: `later-put-wins`.
6. **Incompatible Types:** $P$ is text and $C$ is binary/non-text $\rightarrow$ current non-text content wins: `put-wins`.

Each rule that discards an effect records a warning fact:
```text
(<path>, <reason>)
```
where reason is one of: `delete-wins`, `later-create-wins`, `later-put-wins`, `namespace-wins`, `put-wins`.

---

## 6. Merge Warning Accounting (§6.4)

- During replay, collect all warning facts as a set of unique pairs `(path, reason)`.
- When running `snap merge <repo>`:
  - Compute pre-merge local replay warnings $W_{\text{pre}}$.
  - Compute joined replay warnings $W_{\text{joined}}$.
  - Only emit **net-new warnings** ($W_{\text{joined}} \setminus W_{\text{pre}}$).
  - Print to **stderr**, sorted by path, then reason:
    ```text
    warning: auto-resolved <path>: <reason>
    ```

## 7. Merge Idempotency & No-Op Guarantee (§6.5, §7.8)

- Re-merging the same history (or merging a repository whose patches are
  already fully contained) is a **no-op**: it changes no file, emits no
  warnings, and prints the unchanged (joined) version to stdout. This falls
  directly out of §6's guarantees — import is set union (idempotent,
  commutative, associative), so an already-contained patch set produces an
  identical joined frontier and identical replay.
- `merge` creates no patch and advances no contributor's revision; the
  frontier can grow, but no dot is added on the merging side.
- Re-merging the same history in either direction, or merging in a different
  order, must converge to the same joined bytes and warning set (§6.5) — do
  not implement merge in a way that is sensitive to merge order or repeat
  invocation.
