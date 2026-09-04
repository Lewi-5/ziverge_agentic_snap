import { err, ok } from "../../domain/result.js";
import { initRepository } from "../../application/init-repository.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

export const initCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["init", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  if (parsed.value.kind !== "init") {
    throw new Error("unreachable: init grammar returned another command");
  }

  const targetPath = parsed.value.path ?? ".";
  const result = await initRepository({ cwd: context.cwd, targetPath }, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "initialized", version: result.value.version });
};
