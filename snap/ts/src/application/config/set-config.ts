import * as path from "node:path";
import { serializeConfiguration } from "../../domain/config/serialize.js";
import type { SnapConfiguration } from "../../domain/config/types.js";
import { domainError, type DomainError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import { createContributorId } from "../../domain/version/contributor-id.js";
import type { EnvironmentPort } from "../../ports/environment-port.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";

export interface SetConfigInput {
  readonly cwd: string;
  readonly global: boolean;
  readonly contributorId: string;
}

export interface SetConfigPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly environment: EnvironmentPort;
}

/**
 * `snap config [--global] contributor.id <id>` (SPEC §§7.2, 8). Validates the
 * ID before any filesystem access, then completely replaces the target
 * configuration document — prior malformed content or unknown fields are
 * discarded, never read.
 */
export async function setConfig(input: SetConfigInput, ports: SetConfigPorts): Promise<Result<void, DomainError>> {
  const idResult = createContributorId(input.contributorId);
  if (!idResult.ok) {
    return idResult;
  }

  let targetPath: string;
  if (input.global) {
    const home = ports.environment.getEnv("HOME");
    if (home === undefined || home === "") {
      return err(domainError("validation", "global configuration is unavailable"));
    }
    targetPath = path.join(home, ".snapconfig.json");
  } else {
    const repoRoot = await ports.repositoryDiscovery.findRepositoryRoot(input.cwd);
    if (repoRoot === null) {
      return err(domainError("not-found", "not a Snap repository"));
    }
    targetPath = path.join(repoRoot, ".snap", "config.json");
  }

  const config: SnapConfiguration = { contributor: { id: idResult.value } };
  await ports.fileSystem.writeFile(targetPath, serializeConfiguration(config));
  return ok(undefined);
}
