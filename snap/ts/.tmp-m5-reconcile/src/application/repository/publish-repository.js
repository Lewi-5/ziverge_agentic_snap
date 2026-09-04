import * as path from "node:path";
import { serializeRepositoryDocument } from "../../domain/repository/serialize.js";
function randomTempSuffix() {
    return `${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}
/**
 * Atomically replaces `.snap/repository.json` (SPEC §§4.1, 10;
 * module3planCORRECTIONS.md #3): writes a uniquely-named temporary file in
 * the same `.snap/` directory, durably flushes it (`writeFileDurable`:
 * open + write + `sync()` + close, not a plain write), then renames it onto
 * `repository.json` (`fs.rename`, which replaces an existing destination on
 * every platform including Windows). The existing file is never deleted or
 * replaced before the new one is fully written and closed. On any failure
 * before or during the rename, the temporary file is removed on a
 * best-effort basis and the failure is rethrown — this is an unexpected
 * adapter failure (exit 2), not an expected domain error.
 */
export async function publishRepository(repoRoot, 
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is an immutable, already-readonly domain value; the rule does not recognize the branded ContributorId author field as deeply readonly.
document, ports) {
    const snapDir = path.join(repoRoot, ".snap");
    const finalPath = path.join(snapDir, "repository.json");
    const tempPath = path.join(snapDir, `repository.json.tmp-${randomTempSuffix()}`);
    const contents = serializeRepositoryDocument(document);
    try {
        await ports.fileSystem.writeFileDurable(tempPath, contents);
        await ports.fileSystem.renameFile(tempPath, finalPath);
    }
    catch (error) {
        await ports.fileSystem.removeFileIfExists(tempPath);
        throw error;
    }
}
