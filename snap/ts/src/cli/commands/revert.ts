import { revert } from "../../application/commands/revert.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

export const revertCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["revert", ...args]);
  if (!parsed.ok) return err(parsed.error);
  if (parsed.value.kind !== "revert") throw new Error("unreachable: revert grammar returned another command");
  const treeMaterialization = context.ports.treeMaterialization;
  if (treeMaterialization === undefined) throw new Error("tree materialization adapter is unavailable");
  const result = await revert(context.cwd, parsed.value.version, { ...context.ports, treeMaterialization });
  if (!result.ok) return err(result.error);
  return ok({ kind: "reverted", version: result.value.version });
};
