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
  /**
   * Writes a new file durably: open, write, `filehandle.sync()`, close — so
   * the bytes are flushed before the promise resolves, unlike a plain
   * `writeFile` (module3planCORRECTIONS.md #3). Used only for a fresh
   * temporary file that atomic repository publication then renames into
   * place; it does not itself replace an existing file.
   */
  readonly writeFileDurable: (path: string, contents: string) => Promise<void>;
  /** Atomically renames/replaces `newPath` with `oldPath`'s contents (`fs.rename`; overwrites an existing `newPath`). */
  readonly renameFile: (oldPath: string, newPath: string) => Promise<void>;
  /** Best-effort cleanup: removes a file if present, otherwise does nothing. Never throws for a missing path. */
  readonly removeFileIfExists: (path: string) => Promise<void>;
  /** Lists the immediate entry names of a directory (not recursive, not sorted). */
  readonly listDirectory: (path: string) => Promise<readonly string[]>;
}
