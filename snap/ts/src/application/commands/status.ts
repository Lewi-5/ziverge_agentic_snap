import { domainError, type DomainError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import { compareTrees, type TreeDeltaRow } from "../../domain/tree/compare.js";
import { formatVersion } from "../../domain/version/format.js";
import type { Version } from "../../domain/version/types.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface StatusInput {
  readonly cwd: string;
}

export interface StatusPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
}

export interface StatusOutput {
  readonly version: Version;
  readonly rows: readonly TreeDeltaRow[];
}

/** `snap status` (SPEC §7.3). */
export async function status(input: StatusInput, ports: StatusPorts): Promise<Result<StatusOutput, DomainError>> {
  const loaded = await loadLocalRepository(input.cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }
  const frontier = loaded.value.repository.document.frontier;
  const currentTree = loaded.value.repository.versions.get(formatVersion(frontier));
  if (currentTree === undefined) {
    return err(domainError("io", "internal: repository frontier has no materialized tree"));
  }

  const working = await readWorkingTree(loaded.value.repoRoot, ports);
  if (!working.ok) {
    return working;
  }

  return ok({ version: frontier, rows: compareTrees(currentTree, working.value) });
}
