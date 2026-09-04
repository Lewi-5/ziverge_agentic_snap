/**
 * Node.js signal adapter for cleanly managing process SIGINT and SIGTERM listeners (SPEC §9).
 * Returns an unregister function so listeners do not leak across tests or lifecycles.
 */
export function createNodeSignalAdapter() {
    return {
        onSignal(signals, listener) {
            for (const sig of signals) {
                process.on(sig, listener);
            }
            let removed = false;
            return () => {
                if (!removed) {
                    removed = true;
                    for (const sig of signals) {
                        process.off(sig, listener);
                    }
                }
            };
        },
    };
}
