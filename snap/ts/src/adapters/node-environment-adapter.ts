import type { EnvironmentPort } from "../ports/environment-port.js";

/**
 * Reads from the supplied environment record (defaulting to `process.env`).
 * Accepting the source as a parameter lets tests inject a plain object
 * instead of mutating global process state.
 */
export function createNodeEnvironmentAdapter(
  env: Readonly<Partial<Record<string, string>>> = process.env,
): EnvironmentPort {
  return {
    getEnv(name: string): string | undefined {
      return env[name];
    },
  };
}
