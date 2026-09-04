import { commit } from "../../application/commands/commit.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap commit <message>` (SPEC §7.5): exactly one message operand. */
export const commitCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["commit", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  if (parsed.value.kind !== "commit") {
    throw new Error("unreachable: commit grammar returned another command");
  }
  const result = await commit({ cwd: context.cwd, message: parsed.value.message }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "committed", version: result.value.version });
};
