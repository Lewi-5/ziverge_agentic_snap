/**
 * The on-disk repository.json shape (SPEC §4.1). M1 implements only what it
 * genuinely supports: the empty repository value and its canonical encoder.
 * Decoding and validating arbitrary (untrusted) repository JSON is a full
 * contract of its own — schema, closure, cycles, exact-base replay — added
 * in M3/M5 once those rules and their tests exist; no placeholder decoder is
 * exported here in the meantime.
 */
export interface RepositoryDocumentV1 {
  readonly format: 1;
  readonly frontier: readonly (readonly [string, number])[];
  readonly patches: readonly unknown[];
}

export function emptyRepositoryDocument(): RepositoryDocumentV1 {
  return { format: 1, frontier: [], patches: [] };
}

export function encodeRepositoryDocument(document: RepositoryDocumentV1): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
