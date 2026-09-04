/**
 * Terminal capability queries for stdout and stderr (SPEC §7.11).
 */
export interface TerminalPort {
  readonly isStdoutTty: () => boolean;
  readonly isStderrTty: () => boolean;
}
