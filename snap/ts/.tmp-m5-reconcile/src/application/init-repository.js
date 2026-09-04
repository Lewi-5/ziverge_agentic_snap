import * as path from "node:path";
import { domainError } from "../domain/errors.js";
import { encodeRepositoryDocument, emptyRepositoryDocument } from "../domain/repository/document.js";
import { err, ok } from "../domain/result.js";
import { EMPTY_VERSION } from "../domain/version/types.js";
import { resolveOperandPath } from "./paths.js";
export async function initRepository(input, ports) {
    const target = resolveOperandPath(input.cwd, input.targetPath);
    const existingRoot = await ports.repositoryDiscovery.findRepositoryRoot(target);
    if (existingRoot === target) {
        return err(domainError("conflict", "repository already exists"));
    }
    if (existingRoot !== null) {
        return err(domainError("conflict", "cannot initialize inside repository"));
    }
    await ports.fileSystem.mkdirRecursive(target);
    const snapDir = path.join(target, ".snap");
    await ports.fileSystem.mkdirRecursive(snapDir);
    await ports.fileSystem.writeFile(path.join(snapDir, "repository.json"), encodeRepositoryDocument(emptyRepositoryDocument()));
    return ok({ version: EMPTY_VERSION });
}
