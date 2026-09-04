import { createNodeFileSystemAdapter } from "./adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "./adapters/node-repository-discovery-adapter.js";
import { runCli } from "./cli/dispatch.js";

async function main(): Promise<void> {
  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);

  const outcome = await runCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    ports: { fileSystem, repositoryDiscovery },
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
