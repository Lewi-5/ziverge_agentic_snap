import * as fs from "node:fs/promises";
import type { FileSystemEntryKind, FileSystemPort } from "../ports/filesystem-port.js";

function isNodeErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function createNodeFileSystemAdapter(): FileSystemPort {
  return {
    async entryKind(path: string): Promise<FileSystemEntryKind> {
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
      } catch (error) {
        if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          return "missing";
        }
        throw error;
      }
    },

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

    async readFileIfExists(path: string): Promise<Uint8Array | null> {
      try {
        const buffer = await fs.readFile(path);
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      } catch (error) {
        if (isNodeErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          return null;
        }
        throw error;
      }
    },
  };
}
