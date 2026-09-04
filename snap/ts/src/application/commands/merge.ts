import { domainError, type DomainError } from "../../domain/errors.js";
import { materializeVersion } from "../../domain/history/materialize.js";
import { subtractWarningFacts } from "../../domain/history/warning-difference.js";
import type { WarningFact } from "../../domain/history/warnings.js";
import { unionRepositoryDocuments } from "../../domain/repository/union.js";
import { type Result, err, ok } from "../../domain/result.js";
import { isTreeClean } from "../../domain/tree/compare.js";
import { isEmptyMutationPlan, planTreeMutation } from "../../domain/tree/mutation-plan.js";
import { compareCausal } from "../../domain/version/compare.js";
import type { Version } from "../../domain/version/types.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { RepositorySourcePort } from "../../ports/repository-source-port.js";
import type { TreeMaterializationPort } from "../../ports/tree-materialization-port.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { validatePreparedRepository } from "../repository/decode-repository.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { publishRepository } from "../repository/publish-repository.js";
import { classifyRepositorySource } from "../repository/source.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface MergePorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
  readonly treeMaterialization: TreeMaterializationPort;
  readonly repositorySource: RepositorySourcePort;
}

export interface MergeOutput {
  readonly version: Version;
  readonly warnings: readonly WarningFact[];
}

export async function merge(cwd: string, repositoryOperand: string, ports: MergePorts): Promise<Result<MergeOutput, DomainError>> {
  const local = await loadLocalRepository(cwd, ports);
  if (!local.ok) return local;
  const source = classifyRepositorySource(repositoryOperand);
  const operand = await ports.repositorySource.load(source, cwd);
  if (!operand.ok) return operand;
  const union = unionRepositoryDocuments(local.value.repository.document, operand.value.repository.document);
  if (!union.ok) return union;
  const joined = validatePreparedRepository(union.value);
  if (!joined.ok) return joined;
  const localState = materializeVersion(local.value.repository, local.value.repository.document.frontier);
  if (!localState.ok) return localState;
  const joinedState = materializeVersion(joined.value, joined.value.document.frontier);
  if (!joinedState.ok) return joinedState;

  const working = await readWorkingTree(local.value.repoRoot, ports);
  if (!working.ok) return working;
  if (!isTreeClean(localState.value.tree, working.value)) return err(domainError("validation", "working tree is dirty"));
  const plan = planTreeMutation(localState.value.tree, joinedState.value.tree);
  const warnings = subtractWarningFacts(joinedState.value.warnings, localState.value.warnings);
  const historyUnchanged = local.value.repository.document.patches.length === joined.value.document.patches.length
    && compareCausal(local.value.repository.document.frontier, joined.value.document.frontier) === "equal";
  if (historyUnchanged && isEmptyMutationPlan(plan)) return ok({ version: joined.value.document.frontier, warnings: Object.freeze([]) });

  if (!isEmptyMutationPlan(plan)) await ports.treeMaterialization.apply(local.value.repoRoot, plan);
  await publishRepository(local.value.repoRoot, joined.value.document, ports);
  return ok({ version: joined.value.document.frontier, warnings });
}
