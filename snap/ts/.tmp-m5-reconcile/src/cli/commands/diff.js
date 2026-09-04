import { diffVersions, diffWorkingTree } from "../../application/commands/diff.js";
import { err, ok } from "../../domain/result.js";
import { GRAMMAR_ERROR } from "../grammar.js";
/** `snap diff` / `snap diff <old> <new>` (SPEC §7.6). `--repo` is a later milestone. */
export const diffCommand = async (args, context) => {
    if (args.length === 0) {
        const result = await diffWorkingTree(context.cwd, context.ports);
        if (!result.ok) {
            return err(result.error);
        }
        return ok({ kind: "diff", records: result.value });
    }
    if (args.length === 2) {
        const oldVersionText = args[0];
        const newVersionText = args[1];
        if (oldVersionText === undefined || newVersionText === undefined) {
            return err(GRAMMAR_ERROR);
        }
        const result = await diffVersions(context.cwd, oldVersionText, newVersionText, context.ports);
        if (!result.ok) {
            return err(result.error);
        }
        return ok({ kind: "diff", records: result.value });
    }
    return err(GRAMMAR_ERROR);
};
