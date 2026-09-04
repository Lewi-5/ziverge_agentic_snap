import * as path from "node:path";
import { domainError } from "../../domain/errors.js";
import { decodeUtf8Strict } from "../../domain/json/decode-utf8.js";
import { parseJsonStrict } from "../../domain/json/parse-json-strict.js";
import { decodeRepositoryDocument } from "../../domain/repository/schema.js";
import { validateRepository } from "../../domain/repository/validate.js";
import { err, ok } from "../../domain/result.js";
/**
 * Discovers the nearest repository from `startDirectory`, loads
 * `.snap/repository.json` as bytes, and decodes/validates it through the
 * full boundary (fatal UTF-8 -> duplicate-aware JSON -> exact schema ->
 * causal closure -> exact-base semantics -> deterministic replay). Every command
 * routes through this one function rather than re-implementing discovery or
 * decoding.
 */
export async function loadLocalRepository(startDirectory, ports) {
    const repoRoot = await ports.repositoryDiscovery.findRepositoryRoot(startDirectory);
    if (repoRoot === null) {
        return err(domainError("not-found", "not a Snap repository"));
    }
    const manifestPath = path.join(repoRoot, ".snap", "repository.json");
    const bytes = await ports.fileSystem.readFileIfExists(manifestPath);
    if (bytes === null) {
        return err(domainError("io", `repository metadata is missing: ${manifestPath}`));
    }
    const decoded = decodeUtf8Strict(bytes);
    if (!decoded.ok) {
        return decoded;
    }
    const parsed = parseJsonStrict(decoded.value);
    if (!parsed.ok) {
        return parsed;
    }
    const schema = decodeRepositoryDocument(parsed.value);
    if (!schema.ok) {
        return schema;
    }
    const validated = validateRepository(schema.value);
    if (!validated.ok) {
        return validated;
    }
    return ok({ repoRoot, repository: validated.value });
}
