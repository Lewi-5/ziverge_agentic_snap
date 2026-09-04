import type { Change } from "../repository/types.js";
import { bytesEqual } from "./change.js";
import type { WarningFact, WarningReason } from "../history/warnings.js";

export interface PathConflictResolution {
  readonly content: Uint8Array | undefined;
  readonly warning: WarningFact | undefined;
}

function sameContent(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return bytesEqual(left, right);
}

function resolution(path: string, content: Uint8Array | undefined, reason: WarningReason | undefined): PathConflictResolution {
  return Object.freeze({
    content,
    warning: reason === undefined ? undefined : Object.freeze({ path, reason }),
  });
}

/** SPEC §6.4's six whole-path rules, in normative order. */
export function resolvePathConflict(
  path: string,
  base: Uint8Array | undefined,
  current: Uint8Array | undefined,
  authored: Uint8Array | undefined,
  incoming: Change,
): PathConflictResolution {
  if (sameContent(current, authored)) return resolution(path, current, undefined);
  if (authored === undefined) return resolution(path, undefined, "delete-wins");
  if (base !== undefined && current === undefined) return resolution(path, undefined, "delete-wins");
  if (base === undefined && current !== undefined) return resolution(path, authored, "later-create-wins");
  if (incoming.type === "put") return resolution(path, authored, "later-put-wins");
  return resolution(path, current, "put-wins");
}

export function pathContentsEqual(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  return sameContent(left, right);
}
