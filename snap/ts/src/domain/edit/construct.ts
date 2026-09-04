import { domainError, type DomainError } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import { validateTokenSequence } from "../content/tokenize.js";
import type { TextToken } from "../content/types.js";
import { applyEdit } from "./apply.js";
import type { EditOperation, EditScript } from "./types.js";
import { operationKind } from "./types.js";

function exactKeys(value: Readonly<Record<string, unknown>>, expected: string): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === expected;
}

export function constructEdit(value: unknown, base: readonly TextToken[] | null): Result<EditScript, DomainError> {
  if (!Array.isArray(value)) return err(domainError("validation", "edit must be an array"));
  if (value.length === 0) {
    return base === null ? ok(Object.freeze([])) : err(domainError("validation", "empty edit is valid only for empty text creation"));
  }

  const operations: EditOperation[] = [];
  let previousKind: ReturnType<typeof operationKind> | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const raw: unknown = value[index];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return err(domainError("validation", `edit operation ${String(index)} must be an object`));
    }
    const object = raw as Record<string, unknown>;
    let operation: EditOperation;
    if (exactKeys(object, "retain")) {
      if (!Number.isSafeInteger(object["retain"]) || (object["retain"] as number) <= 0) {
        return err(domainError("validation", `edit retain ${String(index)} must be a positive safe integer`));
      }
      operation = Object.freeze({ retain: object["retain"] as number });
    } else if (exactKeys(object, "delete")) {
      if (!Number.isSafeInteger(object["delete"]) || (object["delete"] as number) <= 0) {
        return err(domainError("validation", `edit delete ${String(index)} must be a positive safe integer`));
      }
      operation = Object.freeze({ delete: object["delete"] as number });
    } else if (exactKeys(object, "insert")) {
      const tokens = validateTokenSequence(object["insert"]);
      if (!tokens.ok) {
        return err(domainError("validation", `edit insert ${String(index)}: ${tokens.error.detail}`));
      }
      if (tokens.value.length === 0) {
        return err(domainError("validation", `edit insert ${String(index)}: insert is empty`));
      }
      operation = Object.freeze({ insert: tokens.value });
    } else {
      return err(domainError("validation", `edit operation ${String(index)} must have one operation`));
    }
    const kind = operationKind(operation);
    if (kind === previousKind) return err(domainError("validation", `adjacent ${kind} operations are forbidden`));
    previousKind = kind;
    operations.push(operation);
  }

  const edit = Object.freeze(operations);
  const applied = applyEdit(base ?? [], edit);
  if (!applied.ok) return applied;
  if (base !== null && applied.value.length === base.length && applied.value.every((token, index) => token === base[index])) {
    return err(domainError("validation", "text edit must change file content"));
  }
  return ok(edit);
}
