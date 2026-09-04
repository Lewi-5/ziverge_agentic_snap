import * as path from "node:path";
async function containsExistingSymlink(pathname, fileSystem) {
    const parsed = path.parse(pathname);
    const relative = pathname.slice(parsed.root.length);
    const segments = relative.split(path.sep).filter((segment) => segment.length > 0);
    let current = parsed.root;
    for (const segment of segments) {
        current = path.join(current, segment);
        const kind = await fileSystem.entryKind(current);
        if (kind === "symlink") {
            return true;
        }
        if (kind === "missing") {
            return false;
        }
    }
    return false;
}
export function createNodeRepositoryDiscoveryAdapter(fileSystem) {
    return {
        async findRepositoryRoot(startAbsoluteDir) {
            const normalized = path.resolve(startAbsoluteDir);
            if (await containsExistingSymlink(normalized, fileSystem)) {
                throw new Error("repository discovery does not follow symbolic links");
            }
            let current = normalized;
            for (;;) {
                const snapDir = path.join(current, ".snap");
                const manifestPath = path.join(snapDir, "repository.json");
                if ((await fileSystem.entryKind(snapDir)) === "directory" && (await fileSystem.entryKind(manifestPath)) === "file") {
                    return current;
                }
                const parent = path.dirname(current);
                if (parent === current) {
                    return null;
                }
                current = parent;
            }
        },
    };
}
