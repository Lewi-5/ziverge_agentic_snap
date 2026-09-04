import { domainError, type DomainError } from "../../domain/errors.js";
import { materializeVersion } from "../../domain/history/materialize.js";
import { validateMessage } from "../../domain/repository/message.js";
import { computePatchResult, constructPatch, sortPatches } from "../../domain/repository/patch.js";
import { decodeRepositoryDocument } from "../../domain/repository/schema.js";
import { serializeRepositoryDocument } from "../../domain/repository/serialize.js";
import type { RepositoryDocument } from "../../domain/repository/types.js";
import { validateRepository } from "../../domain/repository/validate.js";
import { parseJsonStrict } from "../../domain/json/parse-json-strict.js";
import { err, ok, type Result } from "../../domain/result.js";
import { selectAuthoredChanges } from "../../domain/tree/change.js";
import type { Version } from "../../domain/version/types.js";
import type { EnvironmentPort } from "../../ports/environment-port.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";
import { resolveContributorId } from "../config/resolve-contributor-id.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";
import { publishRepository } from "../repository/publish-repository.js";
import { readWorkingTree } from "../working-tree/read-working-tree.js";

export interface CommitInput {
  readonly cwd: string;
  readonly message: string;
}

export interface CommitPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly workingTree: WorkingTreePort;
  readonly environment: EnvironmentPort;
}

export interface CommitOutput {
  readonly version: Version;
}

function invalidCommitMessage(): DomainError {
  return domainError("validation", "invalid commit message");
}

/**
 * `snap commit <message>` (SPEC §7.5). Follows the prepare/apply model
 * (PLAN.md "Application use cases"): message validation, repository load,
 * identity resolution, working-tree scan, change construction, and a full
 * re-decode/re-validate of the prepared document all complete before the
 * single atomic metadata write.
 */
export async function commit(input: CommitInput, ports: CommitPorts): Promise<Result<CommitOutput, DomainError>> {
  // SPEC §7.5's message boundary is checked first: an invalid message is
  // reported as such even when the tree happens to be clean (scenario 25's
  // final case), so this must not be reordered after the clean-tree check.
  const message = validateMessage(input.message, { maxBytes: 4096 });
  if (!message.ok) {
    return err(invalidCommitMessage());
  }

  const loaded = await loadLocalRepository(input.cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }

  const contributorId = await resolveContributorId(loaded.value.repoRoot, ports);
  if (!contributorId.ok) {
    return contributorId;
  }

  const frontier = loaded.value.repository.document.frontier;
  const current = materializeVersion(loaded.value.repository.document, frontier);
  if (!current.ok) return current;

  const working = await readWorkingTree(loaded.value.repoRoot, ports);
  if (!working.ok) {
    return working;
  }

  const changes = selectAuthoredChanges(current.value.tree, working.value);
  if (changes.length === 0) {
    return err(domainError("validation", "working tree is clean"));
  }

  const newPatch = constructPatch({
    author: contributorId.value,
    base: frontier,
    message: message.value,
    changes,
  });
  if (!newPatch.ok) {
    return newPatch;
  }

  const newFrontier = computePatchResult(frontier, contributorId.value, newPatch.value.revision);
  if (!newFrontier.ok) {
    return newFrontier;
  }

  const preparedDocument: RepositoryDocument = Object.freeze({
    format: 1,
    frontier: newFrontier.value,
    patches: sortPatches([...loaded.value.repository.document.patches, newPatch.value]),
  });

  // Re-run the complete decode/validate boundary over the document about to
  // be published, the same way any other reader would see it, rather than
  // trusting the in-memory construction above (PLAN.md "Validation boundary").
  const reencoded = parseJsonStrict(serializeRepositoryDocument(preparedDocument));
  if (!reencoded.ok) {
    return reencoded;
  }
  const redecoded = decodeRepositoryDocument(reencoded.value);
  if (!redecoded.ok) {
    return redecoded;
  }
  const revalidated = validateRepository(redecoded.value);
  if (!revalidated.ok) {
    return revalidated;
  }

  await publishRepository(loaded.value.repoRoot, revalidated.value.document, ports);

  return ok({ version: newFrontier.value });
}
