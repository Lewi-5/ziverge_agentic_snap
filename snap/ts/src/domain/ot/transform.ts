import { domainError, type DomainError } from "../errors.js";
import { coalesceOperations } from "../edit/coalesce.js";
import type { EditOperation, EditScript } from "../edit/types.js";
import { err, ok, type Result } from "../result.js";
import { consumeOperation, INITIAL_OPERATION_CURSOR, operationHead, type OperationCursor } from "./operation-stream.js";

function isInsert(operation: EditOperation): operation is Extract<EditOperation, { readonly insert: readonly string[] }> {
  return "insert" in operation;
}

function invalidStream(): Result<EditScript, DomainError> {
  return err(domainError("validation", "OT inputs do not consume the same base token count"));
}

/** SPEC §6.3: transform incoming edit P so it applies after context edit Q. */
export function transformEdit(incoming: EditScript, context: EditScript): Result<EditScript, DomainError> {
  const output: EditOperation[] = [];
  let incomingCursor: OperationCursor = INITIAL_OPERATION_CURSOR;
  let contextCursor: OperationCursor = INITIAL_OPERATION_CURSOR;

  for (;;) {
    const contextHead = operationHead(context, contextCursor);
    if (contextHead !== undefined && contextHead.remaining <= 0) return invalidStream();
    if (contextHead !== undefined && isInsert(contextHead.operation)) {
      output.push(Object.freeze({ retain: contextHead.remaining }));
      contextCursor = consumeOperation(contextHead, contextCursor, contextHead.remaining);
      continue;
    }

    const incomingHead = operationHead(incoming, incomingCursor);
    if (incomingHead !== undefined && incomingHead.remaining <= 0) return invalidStream();
    if (incomingHead !== undefined && isInsert(incomingHead.operation)) {
      const start = incomingHead.operation.insert.length - incomingHead.remaining;
      output.push(Object.freeze({ insert: Object.freeze(incomingHead.operation.insert.slice(start)) }));
      incomingCursor = consumeOperation(incomingHead, incomingCursor, incomingHead.remaining);
      continue;
    }

    if (incomingHead === undefined && contextHead === undefined) break;
    if (incomingHead === undefined || contextHead === undefined) return invalidStream();

    const count = Math.min(incomingHead.remaining, contextHead.remaining);
    if ("retain" in incomingHead.operation && "retain" in contextHead.operation) {
      output.push(Object.freeze({ retain: count }));
    } else if ("delete" in incomingHead.operation && "retain" in contextHead.operation) {
      output.push(Object.freeze({ delete: count }));
    }
    incomingCursor = consumeOperation(incomingHead, incomingCursor, count);
    contextCursor = consumeOperation(contextHead, contextCursor, count);
  }

  return ok(coalesceOperations(output));
}
