/**
 * Creates a TerminalPort adapter backed by Node's process.stdout and process.stderr.
 * Accepts optional explicit TTY states for deterministic testing without mutating process streams.
 */
export function createNodeTerminalAdapter(options) {
    return {
        isStdoutTty() {
            if (options?.stdoutTty !== undefined) {
                return options.stdoutTty;
            }
            return process.stdout.isTTY;
        },
        isStderrTty() {
            if (options?.stderrTty !== undefined) {
                return options.stderrTty;
            }
            return process.stderr.isTTY;
        },
    };
}
