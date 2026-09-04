import { setConfig } from "../../application/config/set-config.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap config [--global] contributor.id <id>` (SPEC §7.2). */
export const configCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["config", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  if (parsed.value.kind !== "config") {
    throw new Error("unreachable: config grammar returned another command");
  }

  const result = await setConfig(
    { cwd: context.cwd, global: parsed.value.isGlobal, contributorId: parsed.value.value },
    context.ports,
  );
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "silent" });
};
