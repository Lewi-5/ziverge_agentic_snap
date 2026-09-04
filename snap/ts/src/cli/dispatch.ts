import { commitCommand } from "./commands/commit.js";
import { configCommand } from "./commands/config.js";
import { diffCommand } from "./commands/diff.js";
import { initCommand } from "./commands/init.js";
import { logCommand } from "./commands/log.js";
import { statusCommand } from "./commands/status.js";
import { mergeCommand } from "./commands/merge.js";
import { revertCommand } from "./commands/revert.js";
import { versionCommand } from "./commands/version.js";
import { serve } from "../application/commands/serve.js";
import type { Command } from "./commands/command.js";
import type { CommandRequest } from "./command-request.js";
import { formatCliErrorLine, unexpectedErrorDetail } from "./errors.js";
import { EXIT_EXPECTED_ERROR, EXIT_SUCCESS, EXIT_UNEXPECTED_ERROR } from "./exit-codes.js";
import { GRAMMAR_ERROR, parseCliArgs } from "./grammar.js";
import { type ResolvedPresentation, resolvePresentation } from "./presentation.js";
import { renderCommandResult, renderWarningFactsPlain } from "./render.js";
import { formatCliErrorLineTerminal, formatCliWarningLineTerminal, renderCommandResultTerminal } from "./render-terminal.js";
import type { CommandResult } from "./results.js";
import type { CliContext, CliOutcome } from "./types.js";
import type { TerminalPort } from "../ports/terminal-port.js";

const COMMANDS: ReadonlyMap<string, Command> = new Map([
  ["init", initCommand],
  ["config", configCommand],
  ["status", statusCommand],
  ["commit", commitCommand],
  ["log", logCommand],
  ["diff", diffCommand],
  ["merge", mergeCommand],
  ["revert", revertCommand],
]);

const NON_TTY_TERMINAL: TerminalPort = {
  isStdoutTty: (): boolean => false,
  isStderrTty: (): boolean => false,
};

function commandName(request: CommandRequest): string | undefined {
  switch (request.kind) {
    case "version":
      return "--version";
    case "serve":
      return undefined;
    case "init":
    case "config":
    case "status":
    case "log":
    case "commit":
    case "diff":
    case "revert":
    case "merge":
      return request.kind;
  }
}

/**
 * Renders a successful CommandResult per the resolved presentation (SPEC
 * §7.11): presentation selects only how output is styled, never whether the
 * command ran or what it did.
 */
function renderSuccess(result: CommandResult, presentation: ResolvedPresentation): string {
  return presentation.stdout === "terminal" ? renderCommandResultTerminal(result) : renderCommandResult(result);
}

function renderError(detail: string, presentation: ResolvedPresentation): string {
  const plainLine = formatCliErrorLine(detail);
  return presentation.stderr === "terminal" ? formatCliErrorLineTerminal(plainLine) : plainLine;
}

function renderWarnings(result: CommandResult, presentation: ResolvedPresentation): string {
  if (result.kind !== "merged") return "";
  if (presentation.stderr === "terminal") {
    return result.warnings.map((warning) => formatCliWarningLineTerminal(`auto-resolved ${warning.path}: ${warning.reason}`)).join("");
  }
  return renderWarningFactsPlain(result.warnings);
}

export async function runCli(context: CliContext): Promise<CliOutcome> {
  // SPEC §7.11: an invalid SNAP_COLOR is reported before command execution,
  // and the error itself is always plain because no valid presentation was
  // selected.
  const presentationResult = resolvePresentation(context.ports.environment, context.ports.terminal ?? NON_TTY_TERMINAL);
  if (!presentationResult.ok) {
    return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: formatCliErrorLine(presentationResult.error.detail) };
  }
  const presentation = presentationResult.value;

  const parsed = parseCliArgs(context.argv);
  if (!parsed.ok) {
    return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: renderError(parsed.error.detail, presentation) };
  }

  try {
    if (parsed.value.kind === "version") {
      const result = await versionCommand([], context);
      return result.ok
        ? { exitCode: EXIT_SUCCESS, stdout: renderSuccess(result.value, presentation), stderr: renderWarnings(result.value, presentation) }
        : { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: renderError(result.error.detail, presentation) };
    }

    if (parsed.value.kind === "serve") {
      const httpServer = context.ports.httpServer;
      const signal = context.ports.signal;
      if (httpServer === undefined) throw new Error("http server adapter is unavailable");
      if (signal === undefined) throw new Error("signal adapter is unavailable");

      const result = await serve(context.cwd, parsed.value.port, { ...context.ports, httpServer, signal });
      if (!result.ok) {
        return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: renderError(result.error.detail, presentation) };
      }

      // SPEC §7.9/§9: the startup URL is always plain, so either renderer
      // produces the same bytes here; renderSuccess keeps the call site
      // uniform with every other command result.
      const urlText = renderSuccess({ kind: "serve-startup", url: result.value.url }, presentation);
      const output = context.ports.output;
      if (output !== undefined) {
        // The URL must be flushed before the process waits for a shutdown
        // signal (module8REMAINING.md work package 3), not buffered until
        // this long-running command finally resolves.
        await output.write(urlText);
        await result.value.closed;
        return { exitCode: EXIT_SUCCESS, stdout: "", stderr: "" };
      }
      await result.value.closed;
      return { exitCode: EXIT_SUCCESS, stdout: urlText, stderr: "" };
    }

    const name = commandName(parsed.value);
    const handler = name === undefined ? undefined : COMMANDS.get(name);
    if (handler === undefined) {
      // Unreachable in practice: "version" and "serve" are handled above,
      // and every remaining CommandRequest kind has a COMMANDS entry. Kept
      // as a defensive fallback rather than a non-null assertion.
      return { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: renderError(GRAMMAR_ERROR.detail, presentation) };
    }

    const result = await handler(context.argv.slice(1), { cwd: context.cwd, ports: context.ports });
    return result.ok
      ? { exitCode: EXIT_SUCCESS, stdout: renderSuccess(result.value, presentation), stderr: renderWarnings(result.value, presentation) }
      : { exitCode: EXIT_EXPECTED_ERROR, stdout: "", stderr: renderError(result.error.detail, presentation) };
  } catch (error) {
    return {
      exitCode: EXIT_UNEXPECTED_ERROR,
      stdout: "",
      stderr: renderError(unexpectedErrorDetail(error), presentation),
    };
  }
}
