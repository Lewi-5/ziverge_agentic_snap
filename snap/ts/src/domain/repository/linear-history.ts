/**
 * Compatibility export for M3 callers. M5's validator supersedes the staged
 * linear-only boundary; there is deliberately no second validation/replay
 * implementation here.
 */
export { validateRepository as validateLinearRepository } from "./validate.js";
