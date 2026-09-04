import { setConfig } from "../../application/config/set-config.js";
import { err, ok } from "../../domain/result.js";
import { GRAMMAR_ERROR } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap config [--global] contributor.id <id>` (SPEC §7.2). */
export const configCommand: Command = async (args, context) => {
  const global = args[0] === "--global";
  const rest = global ? args.slice(1) : args;

  if (rest.length !== 2 || rest[0] !== "contributor.id") {
    return err(GRAMMAR_ERROR);
  }
  const contributorId = rest[1];
  if (contributorId === undefined) {
    return err(GRAMMAR_ERROR);
  }

  const result = await setConfig({ cwd: context.cwd, global, contributorId }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "silent" });
};
