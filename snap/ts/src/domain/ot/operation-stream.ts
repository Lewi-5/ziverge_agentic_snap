import type { EditOperation, EditScript } from "../edit/types.js";

export interface OperationCursor {
  readonly index: number;
  readonly consumed: number;
}

export interface OperationHead {
  readonly operation: EditOperation;
  readonly remaining: number;
}

export const INITIAL_OPERATION_CURSOR: OperationCursor = Object.freeze({ index: 0, consumed: 0 });

export function operationLength(operation: EditOperation): number {
  if ("retain" in operation) return operation.retain;
  if ("delete" in operation) return operation.delete;
  return operation.insert.length;
}

export function operationHead(script: EditScript, cursor: OperationCursor): OperationHead | undefined {
  const operation = script[cursor.index];
  if (operation === undefined) return undefined;
  return Object.freeze({ operation, remaining: operationLength(operation) - cursor.consumed });
}

export function consumeOperation(head: OperationHead, cursor: OperationCursor, count: number): OperationCursor {
  if (count === head.remaining) {
    return Object.freeze({ index: cursor.index + 1, consumed: 0 });
  }
  return Object.freeze({ index: cursor.index, consumed: cursor.consumed + count });
}
