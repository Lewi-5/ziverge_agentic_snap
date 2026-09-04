function versionsEqual(left, right) {
    return left.components.length === right.components.length && left.components.every((component, index) => {
        const other = right.components[index];
        if (other === undefined)
            return false;
        return component.contributorId === other.contributorId && component.revision === other.revision;
    });
}
function operationsEqual(left, right) {
    if ("retain" in left)
        return "retain" in right && left.retain === right.retain;
    if ("delete" in left)
        return "delete" in right && left.delete === right.delete;
    return "insert" in right && left.insert.length === right.insert.length && left.insert.every((token, index) => token === right.insert[index]);
}
function changesEqual(left, right) {
    if (left.type !== right.type || left.path !== right.path)
        return false;
    if (left.type === "delete" || right.type === "delete")
        return left.type === right.type;
    if (left.type === "put" || right.type === "put")
        return left.type === "put" && right.type === "put" && left.content === right.content;
    return left.edit.length === right.edit.length && left.edit.every((operation, index) => {
        const other = right.edit[index];
        return other !== undefined && operationsEqual(operation, other);
    });
}
/** Parsed typed equality used for same-dot collision checks; JSON byte/key order is irrelevant. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Patch is a deeply immutable domain value.
export function patchesStructurallyEqual(left, right) {
    return left.author === right.author
        && left.revision === right.revision
        && versionsEqual(left.base, right.base)
        && left.message === right.message
        && left.changes.length === right.changes.length
        && left.changes.every((change, index) => {
            const other = right.changes[index];
            return other !== undefined && changesEqual(change, other);
        });
}
