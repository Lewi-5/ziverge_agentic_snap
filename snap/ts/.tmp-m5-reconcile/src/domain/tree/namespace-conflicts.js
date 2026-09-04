function pathsConflict(left, right) {
    return left !== right && (left.startsWith(`${right}/`) || right.startsWith(`${left}/`));
}
/** Resolves patch-wide ancestor/descendant collisions before path-level dispatch. */
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types -- maps contain immutable domain byte arrays. */
export function resolveNamespaceConflicts(current, presentTargets, authoredDeletions) {
    const currentAfterDeletes = [...current.keys()].filter((path) => !authoredDeletions.has(path));
    const settled = new Set();
    const removals = new Set();
    const installations = new Map();
    const warningKeys = new Set();
    const warnings = [];
    for (const [incomingPath, content] of presentTargets) {
        const conflicts = currentAfterDeletes.filter((currentPath) => pathsConflict(incomingPath, currentPath));
        if (conflicts.length === 0)
            continue;
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
