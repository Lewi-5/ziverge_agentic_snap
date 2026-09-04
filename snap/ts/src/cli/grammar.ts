import { domainError, type DomainError } from "../domain/errors.js";

/**
 * The single shared diagnostic for every CLI grammar violation (missing
 * command, unknown command, unknown option, extra/misplaced operands).
 * Public scenarios that require distinct M7 grammar diagnostics replace this
 * later; M1 does not introduce command-specific wording that M7 must undo.
 */
export const GRAMMAR_ERROR: DomainError = domainError("validation", "invalid command or arguments");
