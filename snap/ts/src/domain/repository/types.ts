import type { EditScript } from "../edit/types.js";
import type { Version } from "../version/types.js";

// ---------------------------------------------------------------------------
// Change variants (SPEC §4.3)
// ---------------------------------------------------------------------------

export interface TextChange {
  readonly type: "text";
  readonly path: string;
  readonly edit: EditScript;
}

export interface PutChange {
  readonly type: "put";
  readonly path: string;
  readonly content: string; // canonical padded base64
}

export interface DeleteChange {
  readonly type: "delete";
  readonly path: string;
}

export type Change = TextChange | PutChange | DeleteChange;

// ---------------------------------------------------------------------------
// Patch (SPEC §4.2)
// ---------------------------------------------------------------------------

export interface Patch {
  readonly author: string;
  readonly revision: number;
  readonly base: Version;
  readonly message: string;
  readonly changes: readonly Change[];
}

// ---------------------------------------------------------------------------
// Repository document (SPEC §4.1)
// ---------------------------------------------------------------------------

export interface RepositoryDocument {
  readonly format: 1;
  readonly frontier: Version;
  readonly patches: readonly Patch[];
}

// ---------------------------------------------------------------------------
// LinearRepository — the M3 staged-validation result type.
// Distinct from M5's ValidatedRepository so no command can mistake a
// partially-checked value for a fully-validated one.
// ---------------------------------------------------------------------------

declare const linearRepositoryBrand: unique symbol;

export interface LinearRepository {
  readonly document: RepositoryDocument;
  readonly [linearRepositoryBrand]: true;
}

/** Internal constructor — only `validateLinearRepository` creates this. */
export function makeLinearRepository(document: RepositoryDocument): LinearRepository {
  return Object.freeze({ document }) as unknown as LinearRepository;
}
