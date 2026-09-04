export interface RepositoryDiscoveryPort {
  /** Returns the absolute directory containing a regular `.snap/repository.json`, without following symlinks. */
  readonly findRepositoryRoot: (startAbsoluteDir: string) => Promise<string | null>;
}
