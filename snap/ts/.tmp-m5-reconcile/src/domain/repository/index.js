export function dotKey(author, revision) {
    return `${author}\u0000${String(revision)}`;
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable domain value.
export function indexRepository(document) {
    const byDot = new Map();
    const maximumRevisionByAuthor = new Map();
    for (const patch of document.patches) {
        byDot.set(dotKey(patch.author, patch.revision), patch);
        maximumRevisionByAuthor.set(patch.author, Math.max(maximumRevisionByAuthor.get(patch.author) ?? 0, patch.revision));
    }
    return Object.freeze({ byDot, maximumRevisionByAuthor });
}
