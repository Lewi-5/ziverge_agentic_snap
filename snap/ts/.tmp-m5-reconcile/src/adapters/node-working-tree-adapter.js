import * as path from "node:path";
import { domainError } from "../domain/errors.js";
import { err } from "../domain/result.js";
import { constructFileTree } from "../domain/tree/construct.js";
/**
 * Non-following, byte-aware recursive working-tree scanner
 * (module3planCORRECTIONS.md #2). Only a `.snap` directory that is the
 * *first path segment from the scan root* is excluded; a nested
 * `docs/.snap/file` is ordinary tracked content. `entryKind` (lstat-based)
 * classifies every entry without a second stat and without following a
 * symlink.
 */
export function createNodeWorkingTreeAdapter(fileSystem) {
    async function walk(absoluteDir, relativePrefix, isRoot, 
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- `entries` is intentionally mutated as an accumulator; Uint8Array is the configured byte-container exception.
    entries) {
        const names = await fileSystem.listDirectory(absoluteDir);
        for (const name of names) {
            if (isRoot && name === ".snap") {
                continue;
            }
            const absolutePath = path.join(absoluteDir, name);
            const relativePath = relativePrefix === "" ? name : `${relativePrefix}/${name}`;
            const kind = await fileSystem.entryKind(absolutePath);
            if (kind === "directory") {
                const failure = await walk(absolutePath, relativePath, false, entries);
                if (failure !== null) {
                    return failure;
                }
            }
            else if (kind === "file") {
                const bytes = await fileSystem.readFileIfExists(absolutePath);
                if (bytes === null) {
                    return domainError("validation", `unsupported working tree entry: ${relativePath}`);
                }
                entries.push([relativePath, bytes]);
            }
            else {
                // symlink, other, or a missing entry lost to a race: reject, do not follow.
                return domainError("validation", `unsupported working tree entry: ${relativePath}`);
            }
        }
        return null;
    }
    return {
        async scan(repositoryRoot) {
            const entries = [];
            const failure = await walk(repositoryRoot, "", true, entries);
            if (failure !== null) {
                return err(failure);
            }
            return constructFileTree(entries);
        },
    };
}
