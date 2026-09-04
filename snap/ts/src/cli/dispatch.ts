import { initCommand } from "./commands/init.js";
import { versionCommand } from "./commands/version.js";
import type { Command } from "./commands/command.js";
import { formatCliErrorLine, unexpectedErrorDetail } from "./errors.js";
import { EXIT_EXPECTED_ERROR, EXIT_SUCCESS, EXIT_UNEXPECTED_ERROR } from "./exit-codes.js";
import { GRAMMAR_ERROR } from "./grammar.js";
import { renderCommandResult } from "./render.js";
import type { CliContext, CliOutcome } from "./types.js";

const COMMANDS: ReadonlyMap<string, Command> = new Map([["init", initCommand]]);

export async function runCli(context: CliContext): Promise<CliOutcome> {
  if (context.argv[0] === "--version") {
    if (context.argv.length !== 1) {
      return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(GRAMMAR_ERROR.detail) };
    }
    const result = await versionCommand([], context);
    return result.ok
      ? { exitCode: EXIT_SUCCESS, stdout: renderCommandResult(result.value), stderr: "" }
      : { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(result.error.detail) };
  }

  try {
    if (context.argv.length === 0) {
      return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(GRAMMAR_ERROR.detail) };
    }

    const commandName = context.argv[0];
    const handler = commandName === undefined ? undefined : COMMANDS.get(commandName);
    if (handler === undefined) {
      return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(GRAMMAR_ERROR.detail) };
    }

    const result = await handler(context.argv.slice(1), { cwd: context.cwd, ports: context.ports });
    return result.ok
      ? { exitCode: EXIT_SUCCESS, stdout: renderCommandResult(result.value), stderr: "" }
      : { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(result.error.detail) };
  } catch (error) {
    return { exitCode: EXIT_UNEXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(unexpectedErrorDetail(error)) };
  }
}
