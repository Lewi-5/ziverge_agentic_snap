import * as path from "node:path";
import { serializeConfiguration } from "../../domain/config/serialize.js";
import { domainError } from "../../domain/errors.js";
import { err, ok } from "../../domain/result.js";
import { createContributorId } from "../../domain/version/contributor-id.js";
/**
 * `snap config [--global] contributor.id <id>` (SPEC §§7.2, 8). Validates the
 * ID before any filesystem access, then completely replaces the target
 * configuration document — prior malformed content or unknown fields are
 * discarded, never read.
 */
export async function setConfig(input, ports) {
    const idResult = createContributorId(input.contributorId);
    if (!idResult.ok) {
        return idResult;
    }
    let targetPath;
    if (input.global) {
        const home = ports.environment.getEnv("HOME");
        if (home === undefined || home === "") {
            return err(domainError("validation", "global configuration is unavailable"));
        }
        targetPath = path.join(home, ".snapconfig.json");
    }
    else {
        const repoRoot = await ports.repositoryDiscovery.findRepositoryRoot(input.cwd);
        if (repoRoot === null) {
            return err(domainError("not-found", "not a Snap repository"));
        }
        targetPath = path.join(repoRoot, ".snap", "config.json");
    }
    const config = { contributor: { id: idResult.value } };
    await ports.fileSystem.writeFile(targetPath, serializeConfiguration(config));
    return ok(undefined);
}
