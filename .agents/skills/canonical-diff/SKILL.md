---
name: canonical-diff
description: >-
  Deterministic tokenization, canonical Myers/DP diff recurrence, edit scripts, and unified diff output.
  Use when implementing text diffing, patch edit script generation, diff command formatting,
  or line tokenization according to Snap specifications.
---

# Canonical Text Diff & Edit Scripts

This skill defines the tokenization, minimum edit distance algorithm, edit scripts, and diff output formatting required by `SPEC.md` §4.4, §5, and §7.6.

---

## 1. Text Files & Canonical Tokenization (§4.4)

- **Text File Definition:** Valid UTF-8 bytes containing **no NUL byte (`\0`)**.
- **Tokenization Rule:** Split immediately after every LF (`\n`, `0x0A`) byte, **retaining LF in the token**.
  - Example: `"foo\r\nbar"` $\rightarrow$ `["foo\r\n", "bar"]`
  - Example: `"hello\n"` $\rightarrow$ `["hello\n"]`
  - Example: `""` (empty file) $\rightarrow$ `[]` (0 tokens)
- **Token Invariant:** Every token except possibly the final one ends with `\n`. No token contains `\n` before its final byte.

---

## 2. Canonical Edit Scripts (§4.4)

An edit script transforms sequence $A$ into sequence $B$ using single-key objects:
- `{"retain": n}` — copies $n$ old tokens from base.
- `{"delete": n}` — consumes and removes $n$ old tokens from base.
- `{"insert": [s...]}` — inserts one or more nonempty text tokens.

### Invariants:
1. Counts must be positive integers ($n \ge 1$).
2. **Coalescing:** Adjacent operations of the same kind are strictly forbidden (e.g., merge consecutive retains into one).
3. **Completeness:** The script must consume all $n$ tokens of $A$. No implicit trailing retain.
4. **Empty Script:** Valid only when creating an empty text file from nothing.

---

## 3. Canonical Diff Recurrence (§5)

Given old tokens $A$ of length $n$ and new tokens $B$ of length $m$:

### Recurrence Matrix $D(i, j)$
$$D(n, m) = 0$$
$$D(i, m) = n - i \quad (0 \le i < n)$$
$$D(n, j) = m - j \quad (0 \le j < m)$$
$$\text{If } A[i] = B[j]: \quad D(i, j) = D(i + 1, j + 1)$$
$$\text{Else}: \quad D(i, j) = 1 + \min(D(i + 1, j), D(i, j + 1))$$

### Walk from $(0, 0)$ to $(n, m)$:
At each step $(i, j)$:
1. If $i < n$ and $j < m$ and $A[i] = B[j]$:
   - Output `retain 1`, move to $(i + 1, j + 1)$.
2. Else if $i < n$ and $j < m$:
   - **Delete-on-Tie Bias:** If $D(i + 1, j) \le D(i, j + 1)$:
     - Output `delete 1`, move to $(i + 1, j)$.
   - Else:
     - Output `insert [B[j]]`, move to $(i, j + 1)$.
3. If $i < n$ and $j = m$:
   - Output `delete (n - i)`, move to $(n, m)$.
4. If $i = n$ and $j < m$:
   - Output `insert [B[j..m]]`, move to $(n, m)$.
5. **Coalesce** adjacent operations of the same kind.

*Note:* Every implementation must match this exact sequence, including on repeated lines and tie breaks.

---

## 4. Diff Command Formatting (§7.6)

Changed paths are sorted by path using unsigned UTF-8 bytes.

### Unified Diff Format for Text Changes:
```text
--- a/<path>
+++ b/<path>
@@ -1,<old-token-count> +1,<new-token-count> @@
 <retained token>
-<deleted token>
+<inserted token>
```
- If a side is absent (file created or deleted), use `/dev/null` for that header line.
- If a token does not end with `\n`, print the token, an explicit LF, and:
  ```text
  \ No newline at end of file
  ```

### Binary File Diff Format:
If either version of a file is binary (non-UTF-8 or contains NUL byte):
```text
Binary files a/<path> and b/<path> differ
```
(Substitute `/dev/null` for an absent side).

### Clean Diff:
If there are no differences between trees, produce zero output and exit code 0.
