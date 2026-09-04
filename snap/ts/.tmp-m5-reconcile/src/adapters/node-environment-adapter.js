/**
 * Reads from the supplied environment record (defaulting to `process.env`).
 * Accepting the source as a parameter lets tests inject a plain object
 * instead of mutating global process state.
 */
export function createNodeEnvironmentAdapter(env = process.env) {
    return {
        getEnv(name) {
            return env[name];
        },
    };
}
