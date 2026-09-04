import type { EnvironmentPort } from "../ports/environment-port.js";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../ports/repository-discovery-port.js";

export interface CliPorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly environment: EnvironmentPort;
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
