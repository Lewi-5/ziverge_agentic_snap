import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
function warningKey(fact) {
    return `${fact.path}\u0000${fact.reason}`;
}
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- facts are copied into frozen values and never mutated.
export function sortWarningFacts(facts) {
    const unique = new Map();
    for (const fact of facts)
        unique.set(warningKey(fact), Object.freeze({ ...fact }));
    return Object.freeze([...unique.values()].sort((left, right) => {
        const pathOrder = compareUnsignedUtf8(left.path, right.path);
        return pathOrder === 0 ? compareUnsignedUtf8(left.reason, right.reason) : pathOrder;
    }));
}
