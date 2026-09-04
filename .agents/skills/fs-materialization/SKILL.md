---
name: fs-materialization
description: >-
  Filesystem tree materialization, prefix-free path guarantees, working tree scanning, and atomic mutations for Snap.
  Use when implementing repository discovery, working tree status checks, disk materialization, symlink detection, or atomic file writes.
---

# Filesystem Materialization & Atomic Safety

This skill covers working tree scanning, prefix-free path handling, disk materialization, and safe atomic mutations as defined in `SPEC.md` §2, §4.3, and §10.

---

## 1. Repository Discovery & Path Rules (§2, §7)

- **Repository Root Discovery:** Walk upward from the current working directory to the filesystem root looking for a directory containing `.snap/repository.json`.
- **Tracked Path Format:**
  - Relative path using forward slashes (`/`).
  - Nonempty UTF-8 string with no ASCII control characters and no backslashes (`\`).
  - No empty segments, `.`, or `..` segments (no leading/trailing slashes, no consecutive slashes).
  - First segment must NOT be `.snap`.
  - Binary/byte sorting order (no Unicode or case normalization).
- **Prefix-Free Guarantee:** If `a` is a file, no `a/...` path may exist.

---

## 2. Working Tree Scanning & Cleanliness (§2, §10)

Snap tracks regular files below the repository root (excluding `.snap/`):
- **Empty Directories:** Ignored and never tracked.
- **Unsupported Entries:** Symlinks, FIFOs, sockets, and devices are strictly unsupported.
  - Snap must detect them, refuse to follow them, and fail immediately with an error.
- **Clean vs. Dirty Check:**
  - A working tree is **clean** if and only if every tracked file matches the exact bytes of the current materialized tree, no tracked files are missing, no untracked files exist, and no unsupported entries exist.
  - Otherwise, it is **dirty**.
  - Delta classification: `A` (added), `M` (modified bytes), `D` (deleted).

---

## 3. Validation Before Mutation (§10)

For mutating commands (`revert`, `merge`):
1. Complete all parsing, schema validation, dependency resolution, and replay first.
2. Verify that the working tree is **clean**. If dirty, abort immediately with an error before touching disk.
3. If any validation or check fails, **zero filesystem or repository mutations may occur**.

---

## 4. Disk Materialization Algorithm (§6.2, §10)

When materializing target tree $T$ over current tree $C$:
1. **Remove blocking files:** For any path where a file currently exists but a directory is required by $T$, delete the blocking file.
2. **Remove deleted files:** For any path present in $C$ but absent in $T$, remove the file.
3. **Write target files:** Write/overwrite every file in $T$ with exact target bytes. Ensure parent directories exist before writing.
4. **Clean up directories:** Recursively prune empty directories up to the repository root so no stale empty folders remain.
5. All file writes should use binary buffers (preserving arbitrary bytes).

---

## 5. Atomic Repository Updates (§10)

To update `.snap/repository.json`:
1. Working tree files must be written and synchronized **before** updating metadata.
2. Write new repository JSON to a temporary file in the **same directory**, `.snap/` (e.g. `.snap/repository.json.tmp.<random>`) — the temp file must be same-directory so the final replacement is a same-filesystem atomic rename, not a cross-filesystem copy.
3. Flush and close the temporary file.
4. Atomically replace `.snap/repository.json` with the temporary file using each language's atomic rename primitive over the same filesystem: Node's `fs.renameSync`/`fs.promises.rename`, Rust's `std::fs::rename`, or Scala/JVM's `java.nio.file.Files.move` with `StandardCopyOption.ATOMIC_MOVE`. All three map to the same underlying `rename(2)`-style guarantee; pick the one for your target language, not just the Node one.
5. `commit` only needs step 2–4 (the metadata replacement) — its working-tree files are already present, since the working tree itself was the source of the diff. `merge` and `revert` must also materialize working-tree changes first (§4 above), *then* do this metadata replacement.
6. If writing working files fails midway, abort before renaming `repository.json`. Per §10, an I/O failure or interruption during a multi-file update may leave a dirty, partially-updated working tree with the *old* `repository.json` — this is an accepted, documented failure mode (report the failure, let the user repair and retry), not something to paper over with retry/rollback logic. Concurrent-process safety and crash recovery are explicitly out of scope (§12).
