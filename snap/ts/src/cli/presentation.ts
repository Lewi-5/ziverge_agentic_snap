import type { EnvironmentPort } from "../ports/environment-port.js";
import type { TerminalPort } from "../ports/terminal-port.js";
import { type DomainError, domainError } from "../domain/errors.js";
import { type Result, ok, err } from "../domain/result.js";

export type StreamPresentation = "plain" | "terminal";

export interface ResolvedPresentation {
  readonly stdout: StreamPresentation;
  readonly stderr: StreamPresentation;
}

export const SNAP_COLOR_ERROR: DomainError = domainError(
  "validation",
  "SNAP_COLOR must be auto, always, or never",
);

/**
 * Resolves presentation mode for stdout and stderr per SPEC §7.11:
 * - If SNAP_COLOR is invalid: returns SNAP_COLOR_ERROR.
 * - If SNAP_COLOR is "always": both streams use terminal mode.
 * - If SNAP_COLOR is "never": both streams use plain mode.
 * - If SNAP_COLOR is "auto" or unset:
 *   - If NO_COLOR is present in the environment (even empty): both streams use plain mode.
 *   - Otherwise: stdout is terminal iff stdout is a TTY; stderr is terminal iff stderr is a TTY.
 */
export function resolvePresentation(
  env: EnvironmentPort,
  terminal: TerminalPort,
): Result<ResolvedPresentation, DomainError> {
  const snapColor = env.getEnv("SNAP_COLOR");

  if (snapColor !== undefined && snapColor !== "auto" && snapColor !== "always" && snapColor !== "never") {
    return err(SNAP_COLOR_ERROR);
  }

  if (snapColor === "always") {
    return ok({ stdout: "terminal", stderr: "terminal" });
  }

  if (snapColor === "never") {
    return ok({ stdout: "plain", stderr: "plain" });
  }

  // snapColor is "auto" or undefined
  if (env.getEnv("NO_COLOR") !== undefined) {
    return ok({ stdout: "plain", stderr: "plain" });
  }

  return ok({
    stdout: terminal.isStdoutTty() ? "terminal" : "plain",
    stderr: terminal.isStderrTty() ? "terminal" : "plain",
  });
}
