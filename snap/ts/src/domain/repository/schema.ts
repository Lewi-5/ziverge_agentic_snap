import { decodeBase64 } from "../content/base64.js";
import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { compareUnsignedUtf8 } from "../unsigned-utf8.js";
import { createContributorId, type ContributorId } from "../version/contributor-id.js";
import { createVersion } from "../version/construct.js";
import { MAX_REVISION, type Version, type VersionComponent } from "../version/types.js";
import { createTrackedPath, type TrackedPath } from "../tree/path.js";
import { validateMessage } from "./message.js";

// ---------------------------------------------------------------------------
// Stage 2/3 decode result: exact schema + primitive validation only. A text
// change's edit script is kept as raw JSON (`editJson`), not yet a validated
// `EditScript` — validating that an edit script applies exactly requires the
// patch's *materialized* base tree, which the complete M5 validator computes
// while replaying. This type is therefore not a `ValidatedRepository`.
// ---------------------------------------------------------------------------

export interface RawTextChange {
  readonly type: "text";
  readonly path: TrackedPath;
  readonly editJson: unknown;
}

export interface RawPutChange {
  readonly type: "put";
  readonly path: TrackedPath;
  readonly content: Uint8Array;
}

export interface RawDeleteChange {
  readonly type: "delete";
  readonly path: TrackedPath;
}

export type RawChange = RawTextChange | RawPutChange | RawDeleteChange;

export interface RawPatch {
  readonly author: ContributorId;
  readonly revision: number;
  readonly base: Version;
  readonly message: string;
  readonly changes: readonly RawChange[];
}

export interface RawRepositoryDocument {
  readonly format: 1;
  readonly frontier: Version;
  readonly patches: readonly RawPatch[];
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], context: string): Result<void, DomainError> {
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !keys.includes(key));
  if (unknown !== undefined) return err(domainError("validation", `${context} has unknown field: ${unknown}`));
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) return err(domainError("validation", `${context} is missing field: ${missing}`));
  return ok(undefined);
}

function decodeVersion(value: unknown, field: string): Result<Version, DomainError> {
  if (!Array.isArray(value)) {
    return err(domainError("validation", `${field} must be an array`));
  }
  const components: VersionComponent[] = [];
  let previousId: string | undefined;
  for (const rawEntry of value) {
    if (!Array.isArray(rawEntry) || rawEntry.length !== 2) {
      return err(domainError("validation", `${field} entry must be a [contributor id, revision] pair`));
    }
    const pair: readonly unknown[] = rawEntry as readonly unknown[];
    const idRaw: unknown = pair[0];
    const revisionRaw: unknown = pair[1];
    if (typeof idRaw !== "string") {
      return err(domainError("validation", `${field} entry id must be a string`));
    }
    const contributorId = createContributorId(idRaw);
    if (!contributorId.ok) {
      return contributorId;
    }
    if (!Number.isSafeInteger(revisionRaw) || (revisionRaw as number) < 1 || (revisionRaw as number) > MAX_REVISION) {
      return err(domainError("validation", `${field} entry revision must be a positive safe integer`));
    }
    if (previousId !== undefined) {
      const order = compareUnsignedUtf8(previousId, idRaw);
      if (order === 0) {
        return err(domainError("validation", `${field} contains a duplicate contributor id '${idRaw}'`));
      }
      if (order > 0) {
        return err(domainError("validation", `${field} components must be in canonical unsigned UTF-8 order`));
      }
    }
    previousId = idRaw;
    components.push({ contributorId: contributorId.value, revision: revisionRaw as number });
  }
  return createVersion(components);
}

function decodeChange(value: unknown): Result<RawChange, DomainError> {
  if (!isPlainObject(value)) {
    return err(domainError("validation", "change must be an object"));
  }
  const type: unknown = value["type"];
  if (type === "text") {
    const keys = requireExactKeys(value, ["type", "path", "edit"], "text change");
    if (!keys.ok) return keys;
    const pathRaw = value["path"];
    if (typeof pathRaw !== "string") return err(domainError("validation", "change path must be a string"));
    const path = createTrackedPath(pathRaw);
    if (!path.ok) return err(domainError("validation", `path is invalid: ${path.error.detail}`));
    if (!("edit" in value)) return err(domainError("validation", "text change is missing 'edit'"));
    return ok({ type: "text", path: path.value, editJson: value["edit"] });
  }
  if (type === "put") {
    const keys = requireExactKeys(value, ["type", "path", "content"], "put change");
    if (!keys.ok) return keys;
    const pathRaw = value["path"];
    if (typeof pathRaw !== "string") return err(domainError("validation", "change path must be a string"));
    const path = createTrackedPath(pathRaw);
    if (!path.ok) return err(domainError("validation", `path is invalid: ${path.error.detail}`));
    const content = decodeBase64(value["content"]);
    if (!content.ok) return content;
    return ok({ type: "put", path: path.value, content: content.value });
  }
  if (type === "delete") {
    const keys = requireExactKeys(value, ["type", "path"], "delete change");
    if (!keys.ok) return keys;
    const pathRaw = value["path"];
    if (typeof pathRaw !== "string") return err(domainError("validation", "change path must be a string"));
    const path = createTrackedPath(pathRaw);
    if (!path.ok) return err(domainError("validation", `path is invalid: ${path.error.detail}`));
    return ok({ type: "delete", path: path.value });
  }
  return err(domainError("validation", "change type must be 'text', 'put', or 'delete'"));
}

function decodeChanges(value: unknown): Result<readonly RawChange[], DomainError> {
  if (!Array.isArray(value)) return err(domainError("validation", "patch changes must be an array"));
  if (value.length === 0) return err(domainError("validation", "patch changes is empty"));
  const changes: RawChange[] = [];
  let previousPath: string | undefined;
  for (const rawChange of value) {
    const decoded = decodeChange(rawChange);
    if (!decoded.ok) return decoded;
    if (previousPath !== undefined) {
      const order = compareUnsignedUtf8(previousPath, decoded.value.path);
      if (order === 0) return err(domainError("validation", `patch changes contains more than one change for path '${decoded.value.path}'`));
      if (order > 0) return err(domainError("validation", "patch changes must be sorted by path"));
    }
    previousPath = decoded.value.path;
    changes.push(decoded.value);
  }
  return ok(Object.freeze(changes));
}

function decodePatch(value: unknown): Result<RawPatch, DomainError> {
  if (!isPlainObject(value)) {
    return err(domainError("validation", "patch must be an object"));
  }
  const keys = requireExactKeys(value, ["author", "revision", "base", "message", "changes"], "patch");
  if (!keys.ok) return keys;

  const authorRaw = value["author"];
  if (typeof authorRaw !== "string") return err(domainError("validation", "patch author must be a string"));
  const author = createContributorId(authorRaw);
  if (!author.ok) return author;

  const revisionRaw = value["revision"];
  if (!Number.isSafeInteger(revisionRaw) || (revisionRaw as number) < 1 || (revisionRaw as number) > MAX_REVISION) {
    return err(domainError("validation", "patch revision must be a positive safe integer"));
  }

  const base = decodeVersion(value["base"], "patch base");
  if (!base.ok) return base;

  const messageRaw = value["message"];
  if (typeof messageRaw !== "string") return err(domainError("validation", "patch message must be a string"));
  const message = validateMessage(messageRaw);
  if (!message.ok) return message;

  const changes = decodeChanges(value["changes"]);
  if (!changes.ok) return changes;

  return ok({
    author: author.value,
    revision: revisionRaw as number,
    base: base.value,
    message: message.value,
    changes: changes.value,
  });
}

/**
 * Decodes an already-JSON-parsed `repository.json` value through the exact
 * SPEC §4.1 schema: unknown fields, wrong types, non-integer/unsafe numbers,
 * invalid ids/paths/messages/base64, and non-canonical version arrays are
 * all rejected here. Does not yet validate patch sorting, dot contiguity,
 * causal closure, or per-change base preconditions — see `validate.ts`.
 */
export function decodeRepositoryDocument(value: unknown): Result<RawRepositoryDocument, DomainError> {
  if (!isPlainObject(value)) {
    return err(domainError("validation", "repository document must be an object"));
  }
  const keys = requireExactKeys(value, ["format", "frontier", "patches"], "repository");
  if (!keys.ok) return keys;

  if (value["format"] !== 1) {
    return err(domainError("validation", "repository format must be 1"));
  }
  const frontier = decodeVersion(value["frontier"], "repository frontier");
  if (!frontier.ok) return frontier;

  const patchesRaw = value["patches"];
  if (!Array.isArray(patchesRaw)) {
    return err(domainError("validation", "repository patches must be an array"));
  }
  const patches: RawPatch[] = [];
  for (const rawPatch of patchesRaw) {
    const decoded = decodePatch(rawPatch);
    if (!decoded.ok) return decoded;
    patches.push(decoded.value);
  }

  return ok({ format: 1, frontier: frontier.value, patches: Object.freeze(patches) });
}
