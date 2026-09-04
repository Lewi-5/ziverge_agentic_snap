import * as path from "node:path";
import { decodeUtf8Strict } from "../../domain/json/decode-utf8.js";
import { parseJsonStrict } from "../../domain/json/parse-json-strict.js";
import { validateConfiguration } from "../../domain/config/schema.js";
import { domainError } from "../../domain/errors.js";
import { err, ok } from "../../domain/result.js";
function missingIdentityError() {
    return domainError("validation", "contributor.id is required; configure it locally or globally");
}
function readAndValidateConfig(bytes) {
    const decoded = decodeUtf8Strict(bytes);
    if (!decoded.ok) {
        return decoded;
    }
    const parsed = parseJsonStrict(decoded.value);
    if (!parsed.ok) {
        return parsed;
    }
    const config = validateConfiguration(parsed.value);
    if (!config.ok) {
        return config;
    }
    return ok(config.value.contributor.id);
}
/**
 * Resolves the active contributor ID for an authoring command (`commit`,
 * `revert`). Receives the repository root the caller already discovered —
 * it never performs discovery itself (SPEC §8).
 *
 * Local `.snap/config.json` takes strict precedence: if present, its result
 * (success or failure) is final and global configuration is never read. Only
 * a genuinely absent local file falls back to `$HOME/.snapconfig.json`.
 */
export async function resolveContributorId(repoRoot, ports) {
    const localPath = path.join(repoRoot, ".snap", "config.json");
    const localBytes = await ports.fileSystem.readFileIfExists(localPath);
    if (localBytes !== null) {
        return readAndValidateConfig(localBytes);
    }
    const home = ports.environment.getEnv("HOME");
    if (home === undefined || home === "") {
        return err(missingIdentityError());
    }
    const globalPath = path.join(home, ".snapconfig.json");
    const globalBytes = await ports.fileSystem.readFileIfExists(globalPath);
    if (globalBytes === null) {
        return err(missingIdentityError());
    }
    return readAndValidateConfig(globalBytes);
}
