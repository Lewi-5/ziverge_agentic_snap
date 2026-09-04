/**
 * Contract for subscribing to process lifecycle signals with idempotent teardown (SPEC §9).
 */

export interface SignalPort {
  readonly onSignal: (signals: readonly ("SIGINT" | "SIGTERM")[], listener: () => void) => () => void;
}
