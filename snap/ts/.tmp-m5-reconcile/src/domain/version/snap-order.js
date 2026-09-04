import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
/**
 * SPEC §3.4: an arbitrary total order used only to sequence concurrent
 * patches deterministically. Sorted union of contributor ids, compare the
 * counter at each id (absent = 0); the first unequal counter decides.
 */
export function compareSnapOrder(a, b) {
    const revisionsA = new Map(a.components.map((component) => [component.contributorId, component.revision]));
    const revisionsB = new Map(b.components.map((component) => [component.contributorId, component.revision]));
    const idSet = new Set([...revisionsA.keys(), ...revisionsB.keys()]);
    const orderedIds = sortByUnsignedUtf8([...idSet], (id) => id);
    for (const id of orderedIds) {
        const revisionA = revisionsA.get(id) ?? 0;
        const revisionB = revisionsB.get(id) ?? 0;
        if (revisionA !== revisionB) {
            return revisionA < revisionB ? -1 : 1;
        }
    }
    return 0;
}
