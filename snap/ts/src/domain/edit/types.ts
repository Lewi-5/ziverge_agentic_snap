import type { TextToken } from "../content/types.js";

export interface RetainOperation {
  readonly retain: number;
}

export interface DeleteOperation {
  readonly delete: number;
}

export interface InsertOperation {
  readonly insert: readonly TextToken[];
}

export type EditOperation = RetainOperation | DeleteOperation | InsertOperation;
export type EditScript = readonly EditOperation[];

export function operationKind(operation: EditOperation): "retain" | "delete" | "insert" {
  if ("retain" in operation) return "retain";
  if ("delete" in operation) return "delete";
  return "insert";
}

