export interface FileSystemPort {
  readonly pathExists: (path: string) => Promise<boolean>;
  readonly isDirectory: (path: string) => Promise<boolean>;
  readonly mkdirRecursive: (path: string) => Promise<void>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}
