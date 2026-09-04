import { domainError, type DomainError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import { buildDiffRecords, type DiffRecord } from "../../domain/tree/diff-records.js";
import { formatVersion } from "../../domain/version/format.js";
import { parseVersion } from "../../domain/version/parse.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface DiffPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
}

/** `snap diff` with no arguments (SPEC §7.6): current materialized tree vs. the scanned working tree. */
export async function diffWorkingTree(cwd: string, ports: DiffPorts): Promise<Result<readonly DiffRecord[], DomainError>> {
  const loaded = await loadLocalRepository(cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }
  const currentTree = loaded.value.repository.versions.get(formatVersion(loaded.value.repository.document.frontier));
  if (currentTree === undefined) {
    return err(domainError("io", "internal: repository frontier has no materialized tree"));
  }
  const working = await readWorkingTree(loaded.value.repoRoot, ports);
  if (!working.ok) {
    return working;
  }
  return ok(buildDiffRecords(currentTree, working.value));
}

/** `snap diff <old> <new>` (SPEC §7.6): two locally known versions of the same repository. */
export async function diffVersions(
  cwd: string,
  oldVersionText: string,
  newVersionText: string,
  ports: Pick<DiffPorts, "fileSystem" | "repositoryDiscovery">,
): Promise<Result<readonly DiffRecord[], DomainError>> {
  const loaded = await loadLocalRepository(cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }

  const oldVersion = parseVersion(oldVersionText);
  if (!oldVersion.ok) {
    return err(domainError("validation", `invalid version: ${oldVersion.error.detail}`));
  }
  const newVersion = parseVersion(newVersionText);
  if (!newVersion.ok) {
    return err(domainError("validation", `invalid version: ${newVersion.error.detail}`));
  }

  const oldTree = loaded.value.repository.versions.get(formatVersion(oldVersion.value));
  if (oldTree === undefined) {
    return err(domainError("validation", `unknown version: ${oldVersionText}`));
  }
  const newTree = loaded.value.repository.versions.get(formatVersion(newVersion.value));
  if (newTree === undefined) {
    return err(domainError("validation", `unknown version: ${newVersionText}`));
  }

  return ok(buildDiffRecords(oldTree, newTree));
}
