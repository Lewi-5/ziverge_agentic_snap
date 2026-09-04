import { sortWarningFacts, type WarningFact } from "./warnings.js";

function key(fact: WarningFact): string {
  return `${fact.path}\u0000${fact.reason}`;
}

/** Returns joined replay warning facts absent from the pre-merge local replay. */
export function subtractWarningFacts(joined: readonly WarningFact[], local: readonly WarningFact[]): readonly WarningFact[] {
  const localKeys = new Set(local.map(key));
  return sortWarningFacts(joined.filter((fact) => !localKeys.has(key(fact))));
}
