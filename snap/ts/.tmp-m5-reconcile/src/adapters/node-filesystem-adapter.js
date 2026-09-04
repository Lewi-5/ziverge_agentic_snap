import * as fs from "node:fs/promises";
function isNodeErrnoException(error) {
    return error instanceof Error && "code" in error;
}
export function createNodeFileSystemAdapter() {
    return {
        async entryKind(path) {
            try {
                const stats = await fs.lstat(path);
                if (stats.isSymbolicLink()) {
                    return "symlink";
                }
                if (stats.isDirectory()) {
                    return "directory";
                }
                if (stats.isFile()) {
                    return "file";
                }
                return "other";
            }
            catch (error) {
                if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
                    return "missing";
                }
                throw error;
            }
        },
        async pathExists(path) {
            try {
                await fs.lstat(path);
                return true;
            }
            catch (error) {
                if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
                    return false;
                }
                throw error;
            }
        },
        async isDirectory(path) {
            try {
                const stats = await fs.lstat(path);
                return stats.isDirectory();
            }
            catch (error) {
                if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
                    return false;
                }
                throw error;
            }
        },
        async mkdirRecursive(path) {
            await fs.mkdir(path, { recursive: true });
        },
        async writeFile(path, contents) {
            await fs.writeFile(path, contents, "utf8");
        },
        async readFileIfExists(path) {
            try {
                const buffer = await fs.readFile(path);
                return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            }
            catch (error) {
                if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
                    return null;
                }
                throw error;
            }
        },
        async writeFileDurable(path, contents) {
            const handle = await fs.open(path, "w");
            try {
                await handle.writeFile(contents, "utf8");
                await handle.sync();
            }
            finally {
                await handle.close();
            }
        },
        async renameFile(oldPath, newPath) {
            await fs.rename(oldPath, newPath);
        },
        async removeFileIfExists(path) {
            try {
                await fs.unlink(path);
            }
            catch (error) {
                if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
                    return;
                }
                throw error;
            }
        },
        async listDirectory(path) {
            return fs.readdir(path);
        },
    };
}
