import type { DomainError } from "../../domain/errors.js";
import type { Result } from "../../domain/result.js";
import type { CommandResult } from "../results.js";
import type { CliContext } from "../types.js";

/** The shape every command (init, and every command added by later milestones) implements. */
export type Command = (
  args: readonly string[],
  context: Pick<CliContext, "cwd" | "ports">,
) => Promise<Result<CommandResult, DomainError>>;
