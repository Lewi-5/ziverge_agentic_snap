import { domainError, escapeControlCharacters, type DomainError } from "../domain/errors.js";
import { type Result, ok, err } from "../domain/result.js";
import type { CommandRequest } from "./command-request.js";

/**
 * The single shared diagnostic for general CLI grammar violations
 * (missing command, unknown command, unknown option, extra/misplaced operands).
 */
export const GRAMMAR_ERROR: DomainError = domainError("validation", "invalid command or arguments");

/**
 * Usage diagnostic for malformed diff command forms (SPEC §7.6, Scenario 24).
 */
export const DIFF_USAGE_ERROR: DomainError = domainError(
  "validation",
  "usage: snap diff [<old> <new> [--repo <repository>]]",
);

/**
 * Creates an invalid port error diagnostic (SPEC §7.10, Scenario 14).
 */
export function invalidPortError(operand: string): DomainError {
  return domainError("validation", `invalid port: ${escapeControlCharacters(operand)}`);
}

/**
 * Parses raw command-line arguments into a typed CommandRequest AST (SPEC §7).
 * Rejects unknown, missing, misplaced, or extra arguments before any domain use case execution.
 */
export function parseCliArgs(argv: readonly string[]): Result<CommandRequest, DomainError> {
  if (argv.length === 0) {
    return err(GRAMMAR_ERROR);
  }

  const [first, ...rest] = argv;

  if (first === "--version") {
    if (rest.length !== 0) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "version" });
  }

  if (first === "--serve") {
    if (rest.length === 0) {
      return ok({ kind: "serve", port: 8765 });
    }
    if (rest.length === 1) {
      const portStr = rest[0] ?? "";
      // ASCII decimal integer only (SPEC §7.10, module7PLAN)
      if (!/^\d+$/.test(portStr)) {
        return err(invalidPortError(portStr));
      }
      const port = Number(portStr);
      if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
        return err(invalidPortError(portStr));
      }
      return ok({ kind: "serve", port });
    }
    return err(GRAMMAR_ERROR);
  }

  if (first === "init") {
    if (rest.length === 0) {
      return ok({ kind: "init" });
    }
    if (rest.length === 1) {
      const path = rest[0] ?? "";
      if (path.startsWith("--")) {
        return err(GRAMMAR_ERROR);
      }
      return ok({ kind: "init", path });
    }
    return err(GRAMMAR_ERROR);
  }

  if (first === "config") {
    let isGlobal = false;
    let tokens = rest;

    if (tokens[0] === "--global") {
      isGlobal = true;
      tokens = tokens.slice(1);
    }

    if (tokens.length !== 2 || tokens[0] !== "contributor.id") {
      return err(GRAMMAR_ERROR);
    }

    const value = tokens[1] ?? "";
    if (value.startsWith("--")) {
      return err(GRAMMAR_ERROR);
    }

    return ok({ kind: "config", isGlobal, key: "contributor.id", value });
  }

  if (first === "status") {
    if (rest.length !== 0) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "status" });
  }

  if (first === "log") {
    if (rest.length !== 0) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "log" });
  }

  if (first === "commit") {
    if (rest.length !== 1) {
      return err(GRAMMAR_ERROR);
    }
    const message = rest[0] ?? "";
    if (message.startsWith("--")) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "commit", message });
  }

  if (first === "diff") {
    if (rest.length === 0) {
      return ok({ kind: "diff" });
    }
    if (rest.length === 2) {
      const oldVersion = rest[0] ?? "";
      const newVersion = rest[1] ?? "";
      if (oldVersion.startsWith("--") || newVersion.startsWith("--")) {
        return err(DIFF_USAGE_ERROR);
      }
      return ok({ kind: "diff", oldVersion, newVersion });
    }
    if (rest.length === 4 && rest[2] === "--repo") {
      const oldVersion = rest[0] ?? "";
      const newVersion = rest[1] ?? "";
      const repo = rest[3] ?? "";
      if (oldVersion.startsWith("--") || newVersion.startsWith("--") || repo.startsWith("--")) {
        return err(DIFF_USAGE_ERROR);
      }
      return ok({ kind: "diff", oldVersion, newVersion, repo });
    }
    // A single argument that begins with '--' is an unknown option (grammar error),
    // not a diff-usage problem. All other unrecognised shapes are diff-usage errors.
    if (rest.length === 1 && (rest[0] ?? "").startsWith("--")) {
      return err(GRAMMAR_ERROR);
    }
    return err(DIFF_USAGE_ERROR);
  }

  if (first === "revert") {
    if (rest.length !== 1) {
      return err(GRAMMAR_ERROR);
    }
    const version = rest[0] ?? "";
    if (version.startsWith("--")) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "revert", version });
  }

  if (first === "merge") {
    if (rest.length !== 1) {
      return err(GRAMMAR_ERROR);
    }
    const repository = rest[0] ?? "";
    if (repository.startsWith("--")) {
      return err(GRAMMAR_ERROR);
    }
    return ok({ kind: "merge", repository });
  }

  // Any other command or token beginning with --
  return err(GRAMMAR_ERROR);
}
