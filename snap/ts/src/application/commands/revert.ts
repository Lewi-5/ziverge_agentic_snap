import { domainError, type DomainError } from "../../domain/errors.js";
import { materializeVersion } from "../../domain/history/materialize.js";
import { validateMessage } from "../../domain/repository/message.js";
import { computePatchResult, constructPatch, sortPatches } from "../../domain/repository/patch.js";
import type { RepositoryDocument } from "../../domain/repository/types.js";
import { err, ok, type Result } from "../../domain/result.js";
import { selectAuthoredChanges } from "../../domain/tree/change.js";
import { isTreeClean } from "../../domain/tree/compare.js";
import { planTreeMutation } from "../../domain/tree/mutation-plan.js";
import { formatVersion } from "../../domain/version/format.js";
import { parseVersion } from "../../domain/version/parse.js";
import type { Version } from "../../domain/version/types.js";
import type { EnvironmentPort } from "../../ports/environment-port.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { TreeMaterializationPort } from "../../ports/tree-materialization-port.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { resolveContributorId } from "../config/resolve-contributor-id.js";
import { validatePreparedRepository } from "../repository/decode-repository.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { publishRepository } from "../repository/publish-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface RevertPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
  readonly environment: EnvironmentPort;
  readonly treeMaterialization: TreeMaterializationPort;
}

export async function revert(
  cwd: string,
  versionText: string,
  ports: RevertPorts,
): Promise<Result<{ readonly version: Version }, DomainError>> {
  const loaded = await loadLocalRepository(cwd, ports);
  if (!loaded.ok) return loaded;
  const targetVersion = parseVersion(versionText);
  if (!targetVersion.ok) return err(domainError("validation", `invalid version: ${targetVersion.error.detail}`));
  const current = materializeVersion(loaded.value.repository, loaded.value.repository.document.frontier);
  if (!current.ok) return current;
  const target = materializeVersion(loaded.value.repository, targetVersion.value);
  if (!target.ok) return err(domainError("validation", `unknown version: ${versionText}`));

  const contributor = await resolveContributorId(loaded.value.repoRoot, ports);
  if (!contributor.ok) return contributor;
  const working = await readWorkingTree(loaded.value.repoRoot, ports);
  if (!working.ok) return working;
  if (!isTreeClean(current.value.tree, working.value)) return err(domainError("validation", "working tree is dirty"));
  if (isTreeClean(current.value.tree, target.value.tree)) return err(domainError("validation", "target tree is already current"));

  const message = validateMessage(`revert to ${formatVersion(targetVersion.value)}`);
  if (!message.ok) return message;
  const patch = constructPatch({
    author: contributor.value,
    base: loaded.value.repository.document.frontier,
    message: message.value,
    changes: selectAuthoredChanges(current.value.tree, target.value.tree),
  });
  if (!patch.ok) return patch;
  const frontier = computePatchResult(patch.value.base, patch.value.author, patch.value.revision);
  if (!frontier.ok) return frontier;
  const candidate: RepositoryDocument = Object.freeze({
    format: 1,
    frontier: frontier.value,
    patches: Object.freeze(sortPatches([...loaded.value.repository.document.patches, patch.value])),
  });
  const prepared = validatePreparedRepository(candidate);
  if (!prepared.ok) return prepared;
  const plan = planTreeMutation(current.value.tree, target.value.tree);
  await ports.treeMaterialization.apply(loaded.value.repoRoot, plan);
  await publishRepository(loaded.value.repoRoot, prepared.value.document, ports);
  return ok({ version: frontier.value });
}
