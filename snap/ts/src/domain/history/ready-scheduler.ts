import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { compareSnapOrder } from "../version/snap-order.js";
import type { Version } from "../version/types.js";
import { patchResult, type SchedulablePatch } from "./patch-result.js";

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Version is an immutable branded value, but the rule cannot see through its brand.
function baseIsIntegrated(base: Version, integrated: ReadonlyMap<string, number>): boolean {
  return base.components.every((component) => (integrated.get(component.contributorId) ?? 0) >= component.revision);
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- SchedulablePatch contains an immutable branded Version.
function compareReady(left: SchedulablePatch, right: SchedulablePatch): number {
  const leftResult = patchResult(left);
  const rightResult = patchResult(right);
  if (!leftResult.ok || !rightResult.ok) return 0;
  const resultOrder = compareSnapOrder(leftResult.value, rightResult.value);
  if (resultOrder !== 0) return resultOrder;
  const authorOrder = compareUnsignedUtf8(left.author, right.author);
  if (authorOrder !== 0) return authorOrder;
  return left.revision - right.revision;
}

/** Recomputes the ready set after every integration and applies all three tie-breakers. */
export function schedulePatches<const T extends SchedulablePatch>(patches: readonly T[]): Result<readonly T[], DomainError> {
  for (const patch of patches) {
    const result = patchResult(patch);
    if (!result.ok) return result;
  }

  const remaining = new Set<T>(patches);
  const integrated = new Map<string, number>();
  const ordered: T[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((patch) => baseIsIntegrated(patch.base, integrated));
    ready.sort(compareReady);
    const next = ready[0];
    if (next === undefined) {
      return err(domainError("validation", "history has a cycle or missing dependency: no patch is ready"));
    }
    ordered.push(next);
    remaining.delete(next);
    integrated.set(next.author, next.revision);
  }
  return ok(Object.freeze(ordered));
}
