function serializeVersion(version) {
    return version.components.map((component) => [component.contributorId, component.revision]);
}
function serializeEditOperation(operation) {
    if ("retain" in operation)
        return { retain: operation.retain };
    if ("delete" in operation)
        return { delete: operation.delete };
    return { insert: [...operation.insert] };
}
function serializeChange(change) {
    switch (change.type) {
        case "text":
            return { type: "text", path: change.path, edit: change.edit.map(serializeEditOperation) };
        case "put":
            return { type: "put", path: change.path, content: change.content };
        case "delete":
            return { type: "delete", path: change.path };
    }
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Patch is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
function serializePatch(patch) {
    return {
        author: patch.author,
        revision: patch.revision,
        base: serializeVersion(patch.base),
        message: patch.message,
        changes: patch.changes.map(serializeChange),
    };
}
/** Canonical `repository.json` encoding (SPEC §4.1): two-space indent, one trailing LF. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
export function serializeRepositoryDocument(document) {
    const plain = {
        format: document.format,
        frontier: serializeVersion(document.frontier),
        patches: document.patches.map(serializePatch),
    };
    return `${JSON.stringify(plain, null, 2)}\n`;
}
