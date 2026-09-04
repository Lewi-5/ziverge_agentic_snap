import { schedulePatches } from "../../domain/history/ready-scheduler.js";
import { computePatchResult } from "../../domain/repository/patch.js";
import { ok } from "../../domain/result.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
/**
 * `snap log` (SPEC §7.4): patches in reverse canonical integration order.
 * The shared ready scheduler is the sole implementation of history order.
 */
export async function log(input, ports) {
    const loaded = await loadLocalRepository(input.cwd, ports);
    if (!loaded.ok) {
        return loaded;
    }
    const scheduled = schedulePatches(loaded.value.repository.document.patches);
    if (!scheduled.ok)
        return scheduled;
    const entries = [];
    for (const patch of scheduled.value) {
        const resultVersion = computePatchResult(patch.base, patch.author, patch.revision);
        if (!resultVersion.ok) {
            return resultVersion;
        }
        entries.push({ version: resultVersion.value, author: patch.author, message: patch.message });
    }
    entries.reverse();
    return ok({ entries });
}
