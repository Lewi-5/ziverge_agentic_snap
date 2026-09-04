import type { Version } from "./types.js";

/** Assumes the Version invariant (already canonically sorted); does not re-sort. */
export function formatVersion(version: Version): string {
  if (version.components.length === 0) {
    return "()";
  }
  const body = version.components.map((component) => `${component.contributorId}->${String(component.revision)}`).join(",");
  return `(${body})`;
}
