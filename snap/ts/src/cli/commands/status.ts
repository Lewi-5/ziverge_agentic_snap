import { status } from "../../application/commands/status.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap status` (SPEC §7.3). */
export const statusCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["status", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const result = await status({ cwd: context.cwd }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "status", version: result.value.version, rows: result.value.rows });
};
