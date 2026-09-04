const encoder = new TextEncoder();
/**
 * Compares two strings by unsigned lexicographic UTF-8 byte order. This is
 * the single canonical ordering primitive: every later ordering need (path
 * sort, version contributor-id sort, Snap order's id union) must reuse it
 * rather than reimplementing byte comparison.
 */
export function compareUnsignedUtf8(a, b) {
    const bytesA = encoder.encode(a);
    const bytesB = encoder.encode(b);
    const length = Math.min(bytesA.length, bytesB.length);
    for (let index = 0; index < length; index += 1) {
        const byteA = bytesA[index] ?? 0;
        const byteB = bytesB[index] ?? 0;
        if (byteA !== byteB) {
            return byteA < byteB ? -1 : 1;
        }
    }
    if (bytesA.length === bytesB.length) {
        return 0;
    }
    return bytesA.length < bytesB.length ? -1 : 1;
}
export function sortByUnsignedUtf8(items, key) {
    return [...items].sort((a, b) => compareUnsignedUtf8(key(a), key(b)));
}
