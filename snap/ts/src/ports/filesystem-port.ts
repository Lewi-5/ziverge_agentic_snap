export type FileSystemEntryKind = "missing" | "file" | "directory" | "symlink" | "other";

export interface FileSystemPort {
  /** Classifies the path itself without following its final symbolic link. */
  readonly entryKind: (path: string) => Promise<FileSystemEntryKind>;
  readonly pathExists: (path: string) => Promise<boolean>;
  readonly isDirectory: (path: string) => Promise<boolean>;
  readonly mkdirRecursive: (path: string) => Promise<void>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
  /** Returns raw bytes, or `null` only for a missing path (`ENOENT`/`ENOTDIR`); other I/O errors throw. */
  readonly readFileIfExists: (path: string) => Promise<Uint8Array | null>;
}
