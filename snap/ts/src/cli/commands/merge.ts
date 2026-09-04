import { merge } from "../../application/commands/merge.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

export const mergeCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["merge", ...args]);
  if (!parsed.ok) return err(parsed.error);
  if (parsed.value.kind !== "merge") throw new Error("unreachable: merge grammar returned another command");
  const treeMaterialization = context.ports.treeMaterialization;
  if (treeMaterialization === undefined) throw new Error("tree materialization adapter is unavailable");
  const repositorySource = context.ports.repositorySource;
  if (repositorySource === undefined) throw new Error("repository source adapter is unavailable");
  const result = await merge(context.cwd, parsed.value.repository, { ...context.ports, treeMaterialization, repositorySource });
  if (!result.ok) return err(result.error);
  return ok({ kind: "merged", version: result.value.version, warnings: result.value.warnings });
};
