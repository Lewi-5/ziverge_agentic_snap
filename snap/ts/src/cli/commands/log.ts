import { log } from "../../application/commands/log.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap log` (SPEC §7.4). */
export const logCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["log", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const result = await log({ cwd: context.cwd }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "log", entries: result.value.entries });
};
