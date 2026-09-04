import { coalesceOperations } from "./coalesce.js";
export function canonicalDiff(oldTokens, newTokens) {
    const rows = oldTokens.length + 1;
    const columns = newTokens.length + 1;
    const distance = new Uint32Array(rows * columns);
    const at = (i, j) => distance[i * columns + j] ?? 0;
    const set = (i, j, value) => { distance[i * columns + j] = value; };
    for (let i = oldTokens.length; i >= 0; i -= 1) {
        for (let j = newTokens.length; j >= 0; j -= 1) {
            if (i === oldTokens.length)
                set(i, j, newTokens.length - j);
            else if (j === newTokens.length)
                set(i, j, oldTokens.length - i);
            else if (oldTokens[i] === newTokens[j])
                set(i, j, at(i + 1, j + 1));
            else
                set(i, j, 1 + Math.min(at(i + 1, j), at(i, j + 1)));
        }
    }
    const operations = [];
    let i = 0;
    let j = 0;
    while (i < oldTokens.length || j < newTokens.length) {
        if (i < oldTokens.length && j < newTokens.length) {
            if (oldTokens[i] === newTokens[j]) {
                operations.push({ retain: 1 });
                i += 1;
                j += 1;
            }
            else if (at(i + 1, j) <= at(i, j + 1)) {
                operations.push({ delete: 1 });
                i += 1;
            }
            else {
                operations.push({ insert: Object.freeze([newTokens[j] ?? ""]) });
                j += 1;
            }
        }
        else if (i < oldTokens.length) {
            operations.push({ delete: oldTokens.length - i });
            i = oldTokens.length;
        }
        else {
            operations.push({ insert: Object.freeze(newTokens.slice(j)) });
            j = newTokens.length;
        }
    }
    return coalesceOperations(operations);
}
