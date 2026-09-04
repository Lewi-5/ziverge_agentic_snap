import { log } from "../../application/commands/log.js";
import { err, ok } from "../../domain/result.js";
import { GRAMMAR_ERROR } from "../grammar.js";
/** `snap log` (SPEC §7.4). */
export const logCommand = async (args, context) => {
    if (args.length !== 0) {
        return err(GRAMMAR_ERROR);
    }
    const result = await log({ cwd: context.cwd }, context.ports);
    if (!result.ok) {
        return err(result.error);
    }
    return ok({ kind: "log", entries: result.value.entries });
};
