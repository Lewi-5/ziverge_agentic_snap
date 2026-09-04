import type { EnvironmentPort } from "../ports/environment-port.js";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../ports/repository-discovery-port.js";
import type { TerminalPort } from "../ports/terminal-port.js";
import type { WorkingTreePort } from "../ports/working-tree-port.js";
import type { TreeMaterializationPort } from "../ports/tree-materialization-port.js";
import type { RepositorySourcePort } from "../ports/repository-source-port.js";

export interface CliPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly environment: EnvironmentPort;
  readonly workingTree: WorkingTreePort;
  /** Required only by M6's merge/revert commands; optional for older command-level test fixtures. */
  readonly treeMaterialization?: TreeMaterializationPort;
  /** Required by cross-repository diff and merge; optional for legacy single-repository fixtures. */
  readonly repositorySource?: RepositorySourcePort;
  /**
   * Optional: only needed to resolve SPEC §7.11 presentation. Callers that
   * omit it (most existing tests) get non-TTY defaults, i.e. plain output in
   * "auto" mode, matching pre-M7 behavior.
   */
  readonly terminal?: TerminalPort;
}

export interface CliContext {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly ports: CliPorts;
}

export interface CliOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
