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
      if (cursor + operation.retain > base.length) return err(domainError("validation", "edit over-consumes base tokens"));
      output.push(...base.slice(cursor, cursor + operation.retain));
      cursor += operation.retain;
    } else if ("delete" in operation) {
      if (cursor + operation.delete > base.length) return err(domainError("validation", "edit over-consumes base tokens"));
      cursor += operation.delete;
    } else {
      output.push(...operation.insert);
    }
  }
  if (cursor < base.length) return err(domainError("validation", "edit under-consumes base tokens"));
  const validated = validateTokenSequence(output);
  if (!validated.ok) return err(domainError("validation", `edit result is not canonical: ${validated.error.detail}`));
  return ok(validated.value);
}

