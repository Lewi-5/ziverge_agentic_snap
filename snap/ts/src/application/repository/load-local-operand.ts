import * as path from "node:path";
import { domainError, type DomainError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import type { ValidatedRepository } from "../../domain/repository/types.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import { decodeAndValidateRepositoryBytes } from "./decode-repository.js";

export interface LoadedRepositoryOperand {
  readonly repoRoot: string;
  readonly repository: ValidatedRepository;
}

/** Loads exactly `<cwd-resolved operand>/.snap/repository.json`; it never performs upward discovery. */
export async function loadLocalOperand(
  cwd: string,
  operand: string,
  ports: { readonly fileSystem: FileSystemPort },
): Promise<Result<LoadedRepositoryOperand, DomainError>> {
  const repoRoot = path.resolve(cwd, operand);
  const manifestPath = path.join(repoRoot, ".snap", "repository.json");
  const bytes = await ports.fileSystem.readFileIfExists(manifestPath);
  if (bytes === null) {
    return err(domainError("io", `repository metadata is missing: ${manifestPath}`));
  }
  const repository = decodeAndValidateRepositoryBytes(bytes);
  if (!repository.ok) return repository;
  return ok({ repoRoot, repository: repository.value });
}
