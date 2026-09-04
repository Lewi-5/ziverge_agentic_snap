import type { DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { selectKnownPatches } from "../repository/known-version.js";
import type { ValidatedRepository } from "../repository/types.js";
import type { FileTree } from "../tree/change.js";
import { formatVersion } from "../version/format.js";
import { EMPTY_VERSION, type Version } from "../version/types.js";
import { integratePatch } from "./integrate-patch.js";
import { schedulePatches } from "./ready-scheduler.js";
import { sortWarningFacts, type WarningFact } from "./warnings.js";

export interface MaterializedVersion {
  readonly tree: FileTree;
  readonly warnings: readonly WarningFact[];
}

const EMPTY_MATERIALIZATION: MaterializedVersion = Object.freeze({ tree: new Map(), warnings: Object.freeze([]) });

/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types -- immutable domain inputs plus an invocation-local mutable cache. */
function materializeWithCache(
  repository: ValidatedRepository,
  version: Version,
  cache: Map<string, MaterializedVersion>,
): Result<MaterializedVersion, DomainError> {
  const key = formatVersion(version);
  const cached = cache.get(key);
  if (cached !== undefined) return ok(cached);

  const selected = selectKnownPatches(repository, version);
  if (!selected.ok) return selected;
  const scheduled = schedulePatches(selected.value);
  if (!scheduled.ok) return scheduled;

  let current: FileTree = EMPTY_MATERIALIZATION.tree;
  const warnings: WarningFact[] = [];
  for (const patch of scheduled.value) {
    const exactBase = materializeWithCache(repository, patch.base, cache);
    if (!exactBase.ok) return exactBase;
    const integrated = integratePatch(exactBase.value.tree, current, patch);
    if (!integrated.ok) return integrated;
    current = integrated.value.tree;
    warnings.push(...integrated.value.warnings);
  }

  const materialized = Object.freeze({ tree: current, warnings: sortWarningFacts(warnings) });
  cache.set(key, materialized);
  return ok(materialized);
}
/* eslint-enable @typescript-eslint/prefer-readonly-parameter-types */

/** Materializes any known causal version from the empty tree. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- document and version are immutable branded/domain values.
export function materializeVersion(repository: ValidatedRepository, version: Version): Result<MaterializedVersion, DomainError> {
  const cache = new Map<string, MaterializedVersion>([[formatVersion(EMPTY_VERSION), EMPTY_MATERIALIZATION]]);
  const result = materializeWithCache(repository, version, cache);
  if (!result.ok) return err(result.error);
  return result;
}
