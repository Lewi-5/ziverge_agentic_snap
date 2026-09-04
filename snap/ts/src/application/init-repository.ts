import * as path from "node:path";
import { domainError, type DomainError } from "../domain/errors.js";
import { encodeRepositoryDocument, emptyRepositoryDocument } from "../domain/repository/document.js";
import { err, ok, type Result } from "../domain/result.js";
import { EMPTY_VERSION, type Version } from "../domain/version/types.js";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../ports/repository-discovery-port.js";
import { resolveOperandPath } from "./paths.js";

export interface InitRepositoryInput {
  readonly cwd: string;
  readonly targetPath: string;
}

export interface InitRepositoryPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
}

export interface InitRepositoryOutput {
  readonly version: Version;
}

export async function initRepository(
  input: InitRepositoryInput,
  ports: InitRepositoryPorts,
): Promise<Result<InitRepositoryOutput, DomainError>> {
  const target = resolveOperandPath(input.cwd, input.targetPath);

  const existingRoot = await ports.repositoryDiscovery.findRepositoryRoot(target);
  if (existingRoot === target) {
    return err(domainError("conflict", "repository already exists"));
  }
  if (existingRoot !== null) {
    return err(domainError("conflict", "cannot initialize inside repository"));
  }

  await ports.fileSystem.mkdirRecursive(target);
  const snapDir = path.join(target, ".snap");
  await ports.fileSystem.mkdirRecursive(snapDir);
  await ports.fileSystem.writeFile(
    path.join(snapDir, "repository.json"),
    encodeRepositoryDocument(emptyRepositoryDocument()),
  );

  return ok({ version: EMPTY_VERSION });
}
