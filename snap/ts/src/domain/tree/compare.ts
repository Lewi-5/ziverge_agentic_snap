import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
import { bytesEqual, type FileTree } from "./change.js";

export type TreeDeltaCode = "A" | "M" | "D";

export interface TreeDeltaRow {
  readonly code: TreeDeltaCode;
  readonly path: string;
}

/**
 * A lighter, byte-equality-only comparison between a current tree and a
 * working tree, used by `status` (and the working-tree `diff`'s dirty
 * check). Distinct from M4's `selectAuthoredChanges`, which additionally
 * computes text edit scripts / base64 payloads that only `commit` needs
 * (module3planCORRECTIONS.md #9). Rows are sorted by unsigned UTF-8 path
 * bytes regardless of status code (SPEC §7.3).
 */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- FileTree is a ReadonlyMap; Uint8Array is the configured byte-container exception.
export function compareTrees(current: FileTree, working: FileTree): readonly TreeDeltaRow[] {
  const paths = sortByUnsignedUtf8([...new Set([...current.keys(), ...working.keys()])], (path) => path);
  const rows: TreeDeltaRow[] = [];
  for (const path of paths) {
    const oldBytes = current.get(path);
    const newBytes = working.get(path);
    if (oldBytes === undefined && newBytes !== undefined) {
      rows.push(Object.freeze({ code: "A", path }));
    } else if (oldBytes !== undefined && newBytes === undefined) {
      rows.push(Object.freeze({ code: "D", path }));
    } else if (oldBytes !== undefined && newBytes !== undefined && !bytesEqual(oldBytes, newBytes)) {
      rows.push(Object.freeze({ code: "M", path }));
    }
  }
  return Object.freeze(rows);
}

/** The working tree is clean when it exactly equals the current tree (SPEC §2). */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- FileTree is a ReadonlyMap; Uint8Array is the configured byte-container exception.
export function isTreeClean(current: FileTree, working: FileTree): boolean {
  return compareTrees(current, working).length === 0;
}
