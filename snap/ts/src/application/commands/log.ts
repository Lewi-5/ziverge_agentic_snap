import type { DomainError } from "../../domain/errors.js";
import { computePatchResult } from "../../domain/repository/patch.js";
import { ok, type Result } from "../../domain/result.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { LogEntry } from "../../cli/results.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";

export interface LogInput {
  readonly cwd: string;
}

export interface LogPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
}

export interface LogOutput {
  readonly entries: readonly LogEntry[];
}

/**
 * `snap log` (SPEC §7.4): patches in reverse canonical integration order.
 * `LinearRepository.document.patches` is already stored in that order
 * (the same order `validateLinearRepository` replayed it in), so `log`
 * only reverses it — it never re-derives history order independently
 * (module3PLAN.md "Never use storage-array order as an independent history-
 * order implementation").
 */
export async function log(input: LogInput, ports: LogPorts): Promise<Result<LogOutput, DomainError>> {
  const loaded = await loadLocalRepository(input.cwd, ports);
  if (!loaded.ok) {
    return loaded;
  }

  const entries: LogEntry[] = [];
  for (const patch of loaded.value.repository.document.patches) {
    const resultVersion = computePatchResult(patch.base, patch.author, patch.revision);
    if (!resultVersion.ok) {
      return resultVersion;
    }
    entries.push({ version: resultVersion.value, author: patch.author, message: patch.message });
  }
  entries.reverse();

  return ok({ entries });
}
