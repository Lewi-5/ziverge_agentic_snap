import { decodeBase64 } from "../content/base64.js";
import { classifyContent } from "../content/classify.js";
import { joinTextTokens } from "../content/tokenize.js";
import { applyEdit } from "../edit/apply.js";
import { domainError, type DomainError } from "../errors.js";
import { err, type Result } from "../result.js";
import type { Patch } from "../repository/types.js";
import type { FileTree } from "../tree/change.js";
import { constructFileTree } from "../tree/construct.js";

const textEncoder = new TextEncoder();

/** Applies already-validated authored changes directly to their exact base. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- FileTree contains immutable byte arrays.
export function applyAuthoredPatch(base: FileTree, patch: Patch): Result<FileTree, DomainError> {
  const target = new Map(base);
  for (const change of patch.changes) {
    if (change.type === "delete") {
      target.delete(change.path);
      continue;
    }
    if (change.type === "put") {
      const decoded = decodeBase64(change.content);
      if (!decoded.ok) return decoded;
      target.set(change.path, decoded.value);
      continue;
    }
    const existing = base.get(change.path);
    const content = existing === undefined ? undefined : classifyContent(existing);
    if (content !== undefined && content.kind !== "text") {
      return err(domainError("validation", `text change at path '${change.path}' requires a text base`));
    }
    const applied = applyEdit(content?.tokens ?? [], change.edit);
    if (!applied.ok) return applied;
    target.set(change.path, textEncoder.encode(joinTextTokens(applied.value)));
  }
  return constructFileTree(target.entries());
}
