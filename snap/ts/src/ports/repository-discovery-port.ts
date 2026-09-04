export interface RepositoryDiscoveryPort {
  /** Returns the absolute directory containing `.snap/`, walking upward from startAbsoluteDir, or null. */
  readonly findRepositoryRoot: (startAbsoluteDir: string) => Promise<string | null>;
}
