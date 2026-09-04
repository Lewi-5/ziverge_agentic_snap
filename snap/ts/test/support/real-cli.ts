import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeEnvironmentAdapter } from "../../src/adapters/node-environment-adapter.js";
import { createNodeFileSystemAdapter } from "../../src/adapters/node-filesystem-adapter.js";
import { createNodeHttpClientAdapter } from "../../src/adapters/node-http-client-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../../src/adapters/node-repository-discovery-adapter.js";
import { createNodeWorkingTreeAdapter } from "../../src/adapters/node-working-tree-adapter.js";
import { createNodeTreeMaterializationAdapter } from "../../src/adapters/node-tree-materialization-adapter.js";
import { createRepositorySourceAdapter } from "../../src/adapters/repository-source-adapter.js";
import { runCli } from "../../src/cli/dispatch.js";
import type { CliOutcome } from "../../src/cli/types.js";

/**
 * A small real-filesystem test harness shared by the M3 process-level
 * command tests. Every command routes through the same Node adapters
 * `main.ts` wires, in an isolated temporary directory with an isolated
 * `HOME`, so these tests exercise the real discovery/scan/publish paths the
 * public acceptance suite exercises, without depending on the harness
 * itself being runnable on this host.
 */
export interface RealCli {
  readonly root: string;
  readonly home: string;
  run: (args: readonly string[], cwd?: string) => Promise<CliOutcome>;
  writeFile: (relativePath: string, contents: string) => Promise<void>;
  removeFile: (relativePath: string) => Promise<void>;
  readFile: (relativePath: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function createRealCli(): Promise<RealCli> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-m3-"));
  const home = path.join(root, "home");
  await fs.mkdir(home, { recursive: true });

  const fileSystem = createNodeFileSystemAdapter();
  const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
  const environment = createNodeEnvironmentAdapter({ HOME: home });
  const workingTree = createNodeWorkingTreeAdapter(fileSystem);
  const treeMaterialization = createNodeTreeMaterializationAdapter();
  const httpClient = createNodeHttpClientAdapter();
  const repositorySource = createRepositorySourceAdapter(fileSystem, httpClient);
  const ports = { fileSystem, repositoryDiscovery, environment, workingTree, treeMaterialization, repositorySource };

  return {
    root,
    home,
    run: (args, cwd) => runCli({ argv: [...args], cwd: cwd ?? root, ports }),
    writeFile: async (relativePath, contents) => {
      const target = path.join(root, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents, "utf8");
    },
    removeFile: async (relativePath) => {
      await fs.rm(path.join(root, relativePath), { force: true });
    },
    readFile: (relativePath) => fs.readFile(path.join(root, relativePath), "utf8"),
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
