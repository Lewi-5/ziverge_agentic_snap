import type { WarningFact } from "../history/warnings.js";
import type { FileTree } from "./change.js";

export interface NamespaceResolution {
  readonly settledIncomingPaths: ReadonlySet<string>;
  readonly removals: ReadonlySet<string>;
  readonly installations: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly WarningFact[];
}

function pathsConflict(left: string, right: string): boolean {
  return left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`));
}

/** Resolves patch-wide ancestor/descendant collisions before path-level dispatch. */
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types -- maps contain immutable domain byte arrays. */
export function resolveNamespaceConflicts(
  current: FileTree,
  presentTargets: ReadonlyMap<string, Uint8Array>,
  authoredDeletions: ReadonlySet<string>,
): NamespaceResolution {
  const currentAfterDeletes = [...current.keys()].filter((path) => !authoredDeletions.has(path));
  const settled = new Set<string>();
  const removals = new Set<string>();
  const installations = new Map<string, Uint8Array>();
  const warningKeys = new Set<string>();
  const warnings: WarningFact[] = [];

  for (const [incomingPath, content] of presentTargets) {
    const conflicts = currentAfterDeletes.filter((currentPath) => pathsConflict(incomingPath, currentPath));
    if (conflicts.length === 0) continue;
    settled.add(incomingPath);
    installations.set(incomingPath, content);
    for (const path of conflicts) {
      removals.add(path);
      const key = `${path}\u0000namespace-wins`;
      if (!warningKeys.has(key)) {
        warningKeys.add(key);
        warnings.push(Object.freeze({ path, reason: "namespace-wins" }));
      }
    }
  }

  return Object.freeze({
    settledIncomingPaths: settled,
    removals,
    installations,
    warnings: Object.freeze(warnings),
  });
}
/* eslint-enable @typescript-eslint/prefer-readonly-parameter-types */
