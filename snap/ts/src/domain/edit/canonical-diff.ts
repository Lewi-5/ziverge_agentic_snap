import type { TextToken } from "../content/types.js";
import { coalesceOperations } from "./coalesce.js";
import type { EditOperation, EditScript } from "./types.js";

export function canonicalDiff(oldTokens: readonly TextToken[], newTokens: readonly TextToken[]): EditScript {
  const rows = oldTokens.length + 1;
  const columns = newTokens.length + 1;
  const distance = new Float64Array(rows * columns);
  const at = (i: number, j: number): number => distance[i * columns + j] ?? 0;
  const set = (i: number, j: number, value: number): void => { distance[i * columns + j] = value; };

  for (let i = oldTokens.length; i >= 0; i -= 1) {
    for (let j = newTokens.length; j >= 0; j -= 1) {
      if (i === oldTokens.length) set(i, j, newTokens.length - j);
      else if (j === newTokens.length) set(i, j, oldTokens.length - i);
      else if (oldTokens[i] === newTokens[j]) set(i, j, at(i + 1, j + 1));
      else set(i, j, 1 + Math.min(at(i + 1, j), at(i, j + 1)));
    }
  }

  const operations: EditOperation[] = [];
  let i = 0;
  let j = 0;
  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i] === newTokens[j]) {
      operations.push({ retain: 1 }); i += 1; j += 1;
    } else if (i < oldTokens.length && j < newTokens.length && at(i + 1, j) <= at(i, j + 1)) {
      operations.push({ delete: 1 }); i += 1;
    } else if (j < newTokens.length) {
      operations.push({ insert: Object.freeze([newTokens[j] ?? ""]) }); j += 1;
    } else {
      operations.push({ delete: oldTokens.length - i }); i = oldTokens.length;
    }
  }
  return coalesceOperations(operations);
}

