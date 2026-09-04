import { domainError, type DomainError } from "../../domain/errors.js";
import { materializeVersion } from "../../domain/history/materialize.js";
import { err, ok, type Result } from "../../domain/result.js";
import { buildDiffRecords, type DiffRecord } from "../../domain/tree/diff-records.js";
import { checkPatchCollisions } from "../../domain/repository/union.js";
import { parseVersion } from "../../domain/version/parse.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { RepositorySourcePort } from "../../ports/repository-source-port.js";
import { classifyRepositorySource } from "../../ports/repository-source.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface DiffPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
  readonly repositorySource?: RepositorySourcePort;
}

/** Cross-repository form: old is local, new is in the explicit operand; neither repository is mutated. */
export async function diffAcrossRepositories(
  cwd: string,
  oldVersionText: string,
  newVersionText: string,
  repositoryOperand: string,
  ports: Pick<DiffPorts, "fileSystem" | "repositoryDiscovery" | "repositorySource">,
): Promise<Result<readonly DiffRecord[], DomainError>> {
  const local = await loadLocalRepository(cwd, ports);
  if (!local.ok) return local;
  const source = classifyRepositorySource(repositoryOperand);
  if (ports.repositorySource === undefined) return err(domainError("io", "repository source adapter is unavailable"));
  const operand = await ports.repositorySource.load(source, cwd);
  if (!operand.ok) return operand;

  const collisions = checkPatchCollisions(local.value.repository.document, operand.value.repository.document);
  if (!collisions.ok) return collisions;

  const oldVersion = parseVersion(oldVersionText);
  if (!oldVersion.ok) return err(domainError("validation", `invalid version: ${oldVersion.error.detail}`));
  const newVersion = parseVersion(newVersionText);
  if (!newVersion.ok) return err(domainError("validation", `invalid version: ${newVersion.error.detail}`));
  const oldTree = materializeVersion(local.value.repository, oldVersion.value);
  if (!oldTree.ok) return err(domainError("validation", `unknown version: ${oldVersionText}`));
  const newTree = materializeVersion(operand.value.repository, newVersion.value);
  if (!newTree.ok) return err(domainError("validation", `unknown version: ${newVersionText}`));
  return ok(buildDiffRecords(oldTree.value.tree, newTree.value.tree));
}

/** `snap diff` with no arguments (SPEC §7.6): current materialized tree vs. the scanned working tree. */
export async function diffWorkingTree(cwd: string, ports: DiffPorts): Promise<Result<readonly DiffRecord[], DomainError>> {
  const loaded = await loadLocalRepository(cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }
  const current = materializeVersion(loaded.value.repository, loaded.value.repository.document.frontier);
  if (!current.ok) return current;
  const working = await readWorkingTree(loaded.value.repoRoot, ports);
  if (!working.ok) {
    return working;
  }
  return ok(buildDiffRecords(current.value.tree, working.value));
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

  const oldTree = materializeVersion(loaded.value.repository, oldVersion.value);
  if (!oldTree.ok) {
    return err(domainError("validation", `unknown version: ${oldVersionText}`));
  }
  const newTree = materializeVersion(loaded.value.repository, newVersion.value);
  if (!newTree.ok) {
    return err(domainError("validation", `unknown version: ${newVersionText}`));
  }

  return ok(buildDiffRecords(oldTree.value.tree, newTree.value.tree));
}
