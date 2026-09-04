export const INITIAL_OPERATION_CURSOR = Object.freeze({ index: 0, consumed: 0 });
export function operationLength(operation) {
    if ("retain" in operation)
        return operation.retain;
    if ("delete" in operation)
        return operation.delete;
    return operation.insert.length;
}
export function operationHead(script, cursor) {
    const operation = script[cursor.index];
    if (operation === undefined)
        return undefined;
    return Object.freeze({ operation, remaining: operationLength(operation) - cursor.consumed });
}
export function consumeOperation(head, cursor, count) {
    if (count === head.remaining) {
        return Object.freeze({ index: cursor.index + 1, consumed: 0 });
    }
    return Object.freeze({ index: cursor.index, consumed: cursor.consumed + count });
}
