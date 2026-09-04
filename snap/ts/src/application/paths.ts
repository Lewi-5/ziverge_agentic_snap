import * as path from "node:path";

export function resolveOperandPath(cwd: string, operand: string): string {
  return path.resolve(cwd, operand);
}
