import { materializeVersion } from "../../domain/history/materialize.js";
import { ok } from "../../domain/result.js";
import { compareTrees } from "../../domain/tree/compare.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";
/** `snap status` (SPEC §7.3). */
export async function status(input, ports) {
    const loaded = await loadLocalRepository(input.cwd, ports);
    if (!loaded.ok) {
        return loaded;
    }
    const frontier = loaded.value.repository.document.frontier;
    const current = materializeVersion(loaded.value.repository, frontier);
    if (!current.ok)
        return current;
    const working = await readWorkingTree(loaded.value.repoRoot, ports);
    if (!working.ok) {
        return working;
    }
    return ok({ version: frontier, rows: compareTrees(current.value.tree, working.value) });
}
