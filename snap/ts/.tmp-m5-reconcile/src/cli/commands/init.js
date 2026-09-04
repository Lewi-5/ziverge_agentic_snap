import { err, ok } from "../../domain/result.js";
import { initRepository } from "../../application/init-repository.js";
import { GRAMMAR_ERROR } from "../grammar.js";
export const initCommand = async (args, context) => {
    const first = args[0];
    if (first?.startsWith("-") === true || args.length > 1) {
        return err(GRAMMAR_ERROR);
    }
    const targetPath = first ?? ".";
    const result = await initRepository({ cwd: context.cwd, targetPath }, context.ports);
    if (!result.ok) {
        return err(result.error);
    }
    return ok({ kind: "initialized", version: result.value.version });
};
