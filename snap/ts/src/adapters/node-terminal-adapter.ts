import type { TerminalPort } from "../ports/terminal-port.js";

export interface NodeTerminalAdapterOptions {
  readonly stdoutTty?: boolean;
  readonly stderrTty?: boolean;
}

/**
 * Creates a TerminalPort adapter backed by Node's process.stdout and process.stderr.
 * Accepts optional explicit TTY states for deterministic testing without mutating process streams.
 */
export function createNodeTerminalAdapter(
  options?: NodeTerminalAdapterOptions,
): TerminalPort {
  return {
    isStdoutTty(): boolean {
      if (options?.stdoutTty !== undefined) {
        return options.stdoutTty;
      }
      return process.stdout.isTTY;
    },
    isStderrTty(): boolean {
      if (options?.stderrTty !== undefined) {
        return options.stderrTty;
      }
      return process.stderr.isTTY;
    },
  };
}
