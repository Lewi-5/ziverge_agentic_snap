import { createVersion } from "./construct.js";
import type { Version, VersionComponent } from "./types.js";

export type CausalRelation = "equal" | "before" | "after" | "concurrent";

function toRevisionMap(version: Version): ReadonlyMap<string, number> {
  return new Map(version.components.map((component) => [component.contributorId, component.revision]));
}

function contributorUnion(a: Version, b: Version): readonly string[] {
  const ids = new Set<string>();
  for (const component of a.components) {
    ids.add(component.contributorId);
  }
  for (const component of b.components) {
    ids.add(component.contributorId);
  }
  return [...ids];
}

/** SPEC §3.3: four-way causal comparison. An absent component is zero. */
export function compareCausal(a: Version, b: Version): CausalRelation {
  const revisionsA = toRevisionMap(a);
  const revisionsB = toRevisionMap(b);
  let aLessOrEqual = true;
  let bLessOrEqual = true;

  for (const id of contributorUnion(a, b)) {
    const revisionA = revisionsA.get(id) ?? 0;
    const revisionB = revisionsB.get(id) ?? 0;
    if (revisionA > revisionB) {
      aLessOrEqual = false;
    }
    if (revisionB > revisionA) {
      bLessOrEqual = false;
    }
  }

  if (aLessOrEqual && bLessOrEqual) {
    return "equal";
  }
  if (aLessOrEqual) {
    return "before";
  }
  if (bLessOrEqual) {
    return "after";
  }
  return "concurrent";
}

/**
 * SPEC §3.3: componentwise max. Routes through the single validating
 * constructor (createVersion); joining two already-valid versions can never
 * fail that validation, so an error here indicates an invariant violation
 * elsewhere in the domain layer.
 */
export function joinVersions(a: Version, b: Version): Version {
  const revisionsA = toRevisionMap(a);
  const revisionsB = toRevisionMap(b);
  const joined: VersionComponent[] = contributorUnion(a, b).map((contributorId) => ({
    contributorId,
    revision: Math.max(revisionsA.get(contributorId) ?? 0, revisionsB.get(contributorId) ?? 0),
  }));
  const result = createVersion(joined);
  if (!result.ok) {
    throw new Error(`unreachable: join of two valid versions produced an invalid version (${result.error.detail})`);
  }
  return result.value;
}
