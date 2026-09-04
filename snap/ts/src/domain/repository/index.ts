import type { Patch, RepositoryDocument } from "./types.js";

export function dotKey(author: string, revision: number): string {
  return `${author}\u0000${String(revision)}`;
}

export interface RepositoryIndex {
  readonly byDot: ReadonlyMap<string, Patch>;
  readonly maximumRevisionByAuthor: ReadonlyMap<string, number>;
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable domain value.
export function indexRepository(document: RepositoryDocument): RepositoryIndex {
  const byDot = new Map<string, Patch>();
  const maximumRevisionByAuthor = new Map<string, number>();
  for (const patch of document.patches) {
    byDot.set(dotKey(patch.author, patch.revision), patch);
    maximumRevisionByAuthor.set(patch.author, Math.max(maximumRevisionByAuthor.get(patch.author) ?? 0, patch.revision));
  }
  return Object.freeze({ byDot, maximumRevisionByAuthor });
}
