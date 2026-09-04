import type { EditOperation } from "../edit/types.js";
import type { Version } from "../version/types.js";
import type { Change, Patch, RepositoryDocument } from "./types.js";

function serializeVersion(version: Version): readonly (readonly [string, number])[] {
  return version.components.map((component) => [component.contributorId, component.revision] as const);
}

function serializeEditOperation(operation: EditOperation): Readonly<Record<string, unknown>> {
  if ("retain" in operation) return { retain: operation.retain };
  if ("delete" in operation) return { delete: operation.delete };
  return { insert: [...operation.insert] };
}

function serializeChange(change: Change): Readonly<Record<string, unknown>> {
  switch (change.type) {
    case "text":
      return { type: "text", path: change.path, edit: change.edit.map(serializeEditOperation) };
    case "put":
      return { type: "put", path: change.path, content: change.content };
    case "delete":
      return { type: "delete", path: change.path };
  }
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Patch is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
function serializePatch(patch: Patch): Readonly<Record<string, unknown>> {
  return {
    author: patch.author,
    revision: patch.revision,
    base: serializeVersion(patch.base),
    message: patch.message,
    changes: patch.changes.map(serializeChange),
  };
}

/** Canonical `repository.json` encoding (SPEC §4.1): two-space indent, one trailing LF. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
export function serializeRepositoryDocument(document: RepositoryDocument): string {
  const plain = {
    format: document.format,
    frontier: serializeVersion(document.frontier),
    patches: document.patches.map(serializePatch),
  };
  return `${JSON.stringify(plain, null, 2)}\n`;
}
