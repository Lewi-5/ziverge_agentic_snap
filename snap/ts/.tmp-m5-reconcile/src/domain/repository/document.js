export function emptyRepositoryDocument() {
    return { format: 1, frontier: [], patches: [] };
}
export function encodeRepositoryDocument(document) {
    return `${JSON.stringify(document, null, 2)}\n`;
}
