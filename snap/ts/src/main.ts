import { createNodeEnvironmentAdapter } from "./adapters/node-environment-adapter.js";
import { createNodeFileSystemAdapter } from "./adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "./adapters/node-repository-discovery-adapter.js";
import { createNodeTerminalAdapter } from "./adapters/node-terminal-adapter.js";
import { createNodeWorkingTreeAdapter } from "./adapters/node-working-tree-adapter.js";
import { createNodeTreeMaterializationAdapter } from "./adapters/node-tree-materialization-adapter.js";
import { createLocalRepositorySourceAdapter } from "./adapters/local-repository-source-adapter.js";
import { runCli } from "./cli/dispatch.js";

async function main(): Promise<void> {
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const environment = createNodeEnvironmentAdapter();
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);
  const terminal = createNodeTerminalAdapter();
  const treeMaterialization = createNodeTreeMaterializationAdapter();
  const repositorySource = createLocalRepositorySourceAdapter(fileSystem);

  const outcome = await runCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    ports: { fileSystem, repositoryDiscovery, environment, workingTree, terminal, treeMaterialization, repositorySource },
  });

  if (outcome.stdout.length > 0) {
    process.stdout.write(outcome.stdout);
  }
  if (outcome.stderr.length > 0) {
    process.stderr.write(outcome.stderr);
  }
  process.exitCode = outcome.exitCode;
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`snap: ${detail}\n`);
  process.exitCode = 2;
});
