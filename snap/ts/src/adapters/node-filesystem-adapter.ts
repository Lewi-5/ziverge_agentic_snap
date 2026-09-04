import * as fs from "node:fs/promises";
import type { FileSystemPort } from "../ports/filesystem-port.js";

function isNodeErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function createNodeFileSystemAdapter(): FileSystemPort {
  return {
    async pathExists(path: string): Promise<boolean> {
      try {
        await fs.lstat(path);
        return true;
      } catch (error) {
        if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          return false;
        }
        throw error;
      }
    },

    async isDirectory(path: string): Promise<boolean> {
      try {
        const stats = await fs.lstat(path);
        return stats.isDirectory();
      } catch (error) {
        if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          return false;
        }
        throw error;
      }
    },

    async mkdirRecursive(path: string): Promise<void> {
      await fs.mkdir(path, { recursive: true });
    },

    async writeFile(path: string, contents: string): Promise<void> {
      await fs.writeFile(path, contents, "utf8");
    },
  };
}
