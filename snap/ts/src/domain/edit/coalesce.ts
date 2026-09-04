import type { EditOperation, EditScript } from "./types.js";
import { operationKind } from "./types.js";

export function coalesceOperations(operations: readonly EditOperation[]): EditScript {
  const result: EditOperation[] = [];
  for (const operation of operations) {
    const copy: EditOperation = "retain" in operation
      ? Object.freeze({ retain: operation.retain })
      : "delete" in operation
        ? Object.freeze({ delete: operation.delete })
        : Object.freeze({ insert: Object.freeze([...operation.insert]) });
    const previous = result[result.length - 1];
    if (previous === undefined || operationKind(previous) !== operationKind(copy)) {
      result.push(copy);
    } else if ("retain" in previous && "retain" in copy) {
      result[result.length - 1] = Object.freeze({ retain: previous.retain + copy.retain });
    } else if ("delete" in previous && "delete" in copy) {
      result[result.length - 1] = Object.freeze({ delete: previous.delete + copy.delete });
    } else if ("insert" in previous && "insert" in copy) {
      result[result.length - 1] = Object.freeze({ insert: Object.freeze([...previous.insert, ...copy.insert]) });
    }
  }
  return Object.freeze(result);
}

