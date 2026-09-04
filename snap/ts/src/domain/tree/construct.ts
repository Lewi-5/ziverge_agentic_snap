import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
import type { FileTree } from "./change.js";
import { createTrackedPath } from "./path.js";

/**
 * The single validating constructor for M4's `FileTree` (a plain
 * `ReadonlyMap<string, Uint8Array>` alias — see
 * `module_plans/module3planCORRECTIONS.md` #1). Every M3 producer of a
 * `FileTree` from untrusted input (a scanned working tree, materialized
 * repository content) must route through this function: it validates every
 * path, rejects duplicates, and rejects a tree that is not prefix-free by
 * path segment (SPEC §2).
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Uint8Array is the configured byte-container exception; nested inside a tuple it is not recognized by the `allow` list.
export function constructFileTree(entries: Iterable<readonly [string, Uint8Array]>): Result<FileTree, DomainError> {
  const collected: [string, Uint8Array][] = [];
  const seen = new Set<string>();
  for (const [path, bytes] of entries) {
    const validated = createTrackedPath(path);
    if (!validated.ok) {
      return validated;
    }
    if (seen.has(path)) {
      return err(domainError("validation", `duplicate tracked path '${path}'`));
    }
    seen.add(path);
    collected.push([path, bytes]);
  }

  for (const [path] of collected) {
    const segments = path.split("/");
    let prefix = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index] ?? "";
      prefix = prefix === "" ? segment : `${prefix}/${segment}`;
      if (seen.has(prefix)) {
        return err(domainError("validation", `tracked tree is not prefix-free: '${prefix}' and '${path}'`));
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Uint8Array is the configured byte-container exception; nested inside a tuple it is not recognized by the `allow` list.
  const sorted = sortByUnsignedUtf8(collected, (entry) => entry[0]);
  return ok(new Map(sorted));
}
