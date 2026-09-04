import { compareUnsignedUtf8 } from "../unsigned-utf8.js";

export type WarningReason = "delete-wins" | "later-create-wins" | "later-put-wins" | "namespace-wins" | "put-wins";

export interface WarningFact {
  readonly path: string;
  readonly reason: WarningReason;
}

function warningKey(fact: WarningFact): string {
  return `${fact.path}\u0000${fact.reason}`;
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- facts are copied into frozen values and never mutated.
export function sortWarningFacts(facts: Iterable<WarningFact>): readonly WarningFact[] {
  const unique = new Map<string, WarningFact>();
  for (const fact of facts) unique.set(warningKey(fact), Object.freeze({ ...fact }));
  return Object.freeze(
    [...unique.values()].sort((left, right) => {
      const pathOrder = compareUnsignedUtf8(left.path, right.path);
      return pathOrder === 0 ? compareUnsignedUtf8(left.reason, right.reason) : pathOrder;
    }),
  );
}
