import { domainError } from "../../domain/errors.js";
import { materializeVersion } from "../../domain/history/materialize.js";
import { err, ok } from "../../domain/result.js";
import { buildDiffRecords } from "../../domain/tree/diff-records.js";
import { parseVersion } from "../../domain/version/parse.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";
/** `snap diff` with no arguments (SPEC §7.6): current materialized tree vs. the scanned working tree. */
export async function diffWorkingTree(cwd, ports) {
    const loaded = await loadLocalRepository(cwd, ports);
    if (!loaded.ok) {
        return loaded;
    }
    const current = materializeVersion(loaded.value.repository, loaded.value.repository.document.frontier);
    if (!current.ok)
        return current;
    const working = await readWorkingTree(loaded.value.repoRoot, ports);
    if (!working.ok) {
        return working;
    }
    return ok(buildDiffRecords(current.value.tree, working.value));
}
/** `snap diff <old> <new>` (SPEC §7.6): two locally known versions of the same repository. */
export async function diffVersions(cwd, oldVersionText, newVersionText, ports) {
    const loaded = await loadLocalRepository(cwd, ports);
    if (!loaded.ok) {
        return loaded;
    }
    const oldVersion = parseVersion(oldVersionText);
    if (!oldVersion.ok) {
        return err(domainError("validation", `invalid version: ${oldVersion.error.detail}`));
    }
    const newVersion = parseVersion(newVersionText);
    if (!newVersion.ok) {
        return err(domainError("validation", `invalid version: ${newVersion.error.detail}`));
    }
    const oldTree = materializeVersion(loaded.value.repository, oldVersion.value);
    if (!oldTree.ok) {
        return err(domainError("validation", `unknown version: ${oldVersionText}`));
    }
    const newTree = materializeVersion(loaded.value.repository, newVersion.value);
    if (!newTree.ok) {
        return err(domainError("validation", `unknown version: ${newVersionText}`));
    }
    return ok(buildDiffRecords(oldTree.value.tree, newTree.value.tree));
}
