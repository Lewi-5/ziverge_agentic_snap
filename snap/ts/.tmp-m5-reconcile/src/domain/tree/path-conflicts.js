import { bytesEqual } from "./change.js";
function sameContent(left, right) {
    if (left === undefined || right === undefined)
        return left === right;
    return bytesEqual(left, right);
}
function resolution(path, content, reason) {
    return Object.freeze({
        content,
        warning: reason === undefined ? undefined : Object.freeze({ path, reason }),
    });
}
/** SPEC §6.4's six whole-path rules, in normative order. */
export function resolvePathConflict(path, base, current, authored, incoming) {
    if (sameContent(current, authored))
        return resolution(path, current, undefined);
    if (authored === undefined)
        return resolution(path, undefined, "delete-wins");
    if (base !== undefined && current === undefined)
        return resolution(path, undefined, "delete-wins");
    if (base === undefined && current !== undefined)
        return resolution(path, authored, "later-create-wins");
    if (incoming.type === "put")
        return resolution(path, authored, "later-put-wins");
    return resolution(path, current, "put-wins");
}
export function pathContentsEqual(left, right) {
    return sameContent(left, right);
}
