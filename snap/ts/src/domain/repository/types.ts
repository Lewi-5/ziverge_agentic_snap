import type { EditScript } from "../edit/types.js";
import type { FileTree } from "../tree/change.js";
import type { ContributorId } from "../version/contributor-id.js";
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
  readonly author: ContributorId;
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
  /**
   * Every known (materializable) version's tree, keyed by `formatVersion`.
   * In a generated linear history every known version is a prefix of the
   * single causal chain, so this map is complete: it always contains
   * `"()"` (the empty tree) plus one entry per patch result version.
   * Computed once, during the same replay `validateLinearRepository`
   * already performs, so `status`/`log`/`diff`/`commit` never re-replay the
   * repository to materialize a version.
   */
  readonly versions: ReadonlyMap<string, FileTree>;
  readonly [linearRepositoryBrand]: true;
}

/** Internal constructor — only `validateLinearRepository` creates this. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- FileTree is a ReadonlyMap; Uint8Array is the configured byte-container exception.
export function makeLinearRepository(document: RepositoryDocument, versions: ReadonlyMap<string, FileTree>): LinearRepository {
  return Object.freeze({ document, versions }) as unknown as LinearRepository;
}

declare const validatedRepositoryBrand: unique symbol;

/** A repository that has passed the complete SPEC §4.5/M5 validation pipeline. */
export interface ValidatedRepository {
  readonly document: RepositoryDocument;
  readonly [validatedRepositoryBrand]: true;
}

/** Internal constructor — only the complete validator may create this brand. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable domain value.
export function makeValidatedRepository(document: RepositoryDocument): ValidatedRepository {
  return Object.freeze({ document }) as unknown as ValidatedRepository;
}
