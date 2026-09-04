import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { validateTokenSequence } from "../content/tokenize.js";
import type { TextToken } from "../content/types.js";
import type { EditScript } from "./types.js";

export function applyEdit(base: readonly TextToken[], edit: EditScript): Result<readonly TextToken[], DomainError> {
  const output: string[] = [];
  let cursor = 0;
  for (const operation of edit) {
    if ("retain" in operation) {
      if (cursor + operation.retain > base.length) return err(domainError("validation", "edit over-consumes base tokens: consumes beyond old content"));
      for (let i = cursor; i < cursor + operation.retain; i += 1) {
        const token = base[i];
        if (token !== undefined) output.push(token);
      }
      cursor += operation.retain;
    } else if ("delete" in operation) {
      if (cursor + operation.delete > base.length) return err(domainError("validation", "edit over-consumes base tokens: consumes beyond old content"));
      cursor += operation.delete;
    } else if ("insert" in operation) {
      for (const token of operation.insert) output.push(token);
    } else {
      return err(domainError("validation", "unknown edit operation kind"));
    }
  }
  if (cursor < base.length) return err(domainError("validation", "edit under-consumes base tokens: does not consume old content"));
  const validated = validateTokenSequence(output);
  if (!validated.ok) return err(domainError("validation", `edit result is not canonical: ${validated.error.detail}`));
  return ok(validated.value);
}

