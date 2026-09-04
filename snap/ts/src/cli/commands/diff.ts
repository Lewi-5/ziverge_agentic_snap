import { diffAcrossRepositories, diffVersions, diffWorkingTree } from "../../application/commands/diff.js";
import { err, ok } from "../../domain/result.js";
import { parseCliArgs } from "../grammar.js";
import type { Command } from "./command.js";

/** `snap diff` / `snap diff <old> <new>` (SPEC §7.6). Cross-repository `--repo` diff is M6 scope. */
export const diffCommand: Command = async (args, context) => {
  const parsed = parseCliArgs(["diff", ...args]);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const request = parsed.value;
  /* c8 ignore next 3 -- parseCliArgs(["diff", ...]) always returns a DiffRequest */
  if (request.kind !== "diff") {
    throw new Error("unreachable: parseCliArgs(['diff', ...]) returned a non-diff request");
  }

  if (request.oldVersion === undefined) {
    const result = await diffWorkingTree(context.cwd, context.ports);
    if (!result.ok) {
      return err(result.error);
    }
    return ok({ kind: "diff", records: result.value });
  }

  if (request.repo !== undefined) {
    const newVersionText = request.newVersion;
    if (newVersionText === undefined) throw new Error("unreachable: cross-repository diff lacks a new version");
    const result = await diffAcrossRepositories(context.cwd, request.oldVersion, newVersionText, request.repo, context.ports);
    if (!result.ok) return err(result.error);
    return ok({ kind: "diff", records: result.value });
  }

  const newVersionText = request.newVersion;
  /* c8 ignore next 3 -- grammar guarantees newVersion is set whenever oldVersion is */
  if (newVersionText === undefined) {
    throw new Error("unreachable: diff grammar accepted an old version without a new version");
  }
  const result = await diffVersions(context.cwd, request.oldVersion, newVersionText, context.ports);
  if (!result.ok) {
    return err(result.error);
  }
  return ok({ kind: "diff", records: result.value });
};
