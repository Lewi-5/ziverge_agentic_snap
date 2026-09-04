import { err, ok } from "../result.js";
import { selectKnownPatches } from "../repository/known-version.js";
import { formatVersion } from "../version/format.js";
import { EMPTY_VERSION } from "../version/types.js";
import { integratePatch } from "./integrate-patch.js";
import { schedulePatches } from "./ready-scheduler.js";
import { sortWarningFacts } from "./warnings.js";
const EMPTY_MATERIALIZATION = Object.freeze({ tree: new Map(), warnings: Object.freeze([]) });
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types -- immutable domain inputs plus an invocation-local mutable cache. */
function materializeWithCache(repository, version, cache) {
    const key = formatVersion(version);
    const cached = cache.get(key);
    if (cached !== undefined)
        return ok(cached);
    const selected = selectKnownPatches(repository, version);
    if (!selected.ok)
        return selected;
    const scheduled = schedulePatches(selected.value);
    if (!scheduled.ok)
        return scheduled;
    let current = EMPTY_MATERIALIZATION.tree;
    const warnings = [];
    for (const patch of scheduled.value) {
        const exactBase = materializeWithCache(repository, patch.base, cache);
        if (!exactBase.ok)
            return exactBase;
        const integrated = integratePatch(exactBase.value.tree, current, patch);
        if (!integrated.ok)
            return integrated;
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
export function materializeVersion(repository, version) {
    const cache = new Map([[formatVersion(EMPTY_VERSION), EMPTY_MATERIALIZATION]]);
    const result = materializeWithCache(repository, version, cache);
    if (!result.ok)
        return err(result.error);
    return result;
}
