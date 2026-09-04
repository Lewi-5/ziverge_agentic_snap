import { status } from "../../application/commands/status.js";
import { err, ok } from "../../domain/result.js";
import { GRAMMAR_ERROR } from "../grammar.js";
/** `snap status` (SPEC §7.3). */
export const statusCommand = async (args, context) => {
    if (args.length !== 0) {
        return err(GRAMMAR_ERROR);
    }
    const result = await status({ cwd: context.cwd }, context.ports);
    if (!result.ok) {
        return err(result.error);
    }
    return ok({ kind: "status", version: result.value.version, rows: result.value.rows });
};
