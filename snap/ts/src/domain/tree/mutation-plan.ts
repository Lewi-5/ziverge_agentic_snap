import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
import { bytesEqual, type FileTree } from "./change.js";

export interface TreeWrite {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface TreeMutationPlan {
  readonly removals: readonly string[];
  readonly writes: readonly TreeWrite[];
}

function deepestFirst(left: string, right: string): number {
  const depthDifference = right.split("/").length - left.split("/").length;
  if (depthDifference !== 0) return depthDifference;
  const sorted = sortByUnsignedUtf8([left, right], (value) => value);
  return sorted[0] === left ? -1 : 1;
}

/** Pure, deterministic plan from the known-clean current tree to a validated target tree. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- FileTree is immutable; Uint8Array is the byte-container exception.
export function planTreeMutation(current: FileTree, target: FileTree): TreeMutationPlan {
  const removals = [...current.keys()].filter((path) => !target.has(path)).sort(deepestFirst);
  const writePaths = [...target.keys()].filter((path) => {
    const existing = current.get(path);
    const desired = target.get(path);
    return desired !== undefined && (existing === undefined || !bytesEqual(existing, desired));
  });
  const writes = sortByUnsignedUtf8(writePaths, (path) => path).map((path) => Object.freeze({
    path,
    bytes: target.get(path) as Uint8Array,
  }));
  return Object.freeze({ removals: Object.freeze(removals), writes: Object.freeze(writes) });
}

export function isEmptyMutationPlan(plan: TreeMutationPlan): boolean {
  return plan.removals.length === 0 && plan.writes.length === 0;
}
