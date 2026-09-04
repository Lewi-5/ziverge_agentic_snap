import { commit } from "../../application/commands/commit.js";
import { err, ok } from "../../domain/result.js";
import { GRAMMAR_ERROR } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap commit <message>` (SPEC §7.5): exactly one message operand. */
export const commitCommand: Command = async (args, context) => {
  if (args.length !== 1) {
    return err(GRAMMAR_ERROR);
  }
  const message = args[0];
  if (message === undefined) {
    return err(GRAMMAR_ERROR);
  }
  const result = await commit({ cwd: context.cwd, message }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "committed", version: result.value.version });
};
