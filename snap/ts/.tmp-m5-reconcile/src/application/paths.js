import * as path from "node:path";
export function resolveOperandPath(cwd, operand) {
    return path.resolve(cwd, operand);
}
