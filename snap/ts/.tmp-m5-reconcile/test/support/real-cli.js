import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodeEnvironmentAdapter } from "../../src/adapters/node-environment-adapter.js";
import { createNodeFileSystemAdapter } from "../../src/adapters/node-filesystem-adapter.js";
import { createNodeRepositoryDiscoveryAdapter } from "../../src/adapters/node-repository-discovery-adapter.js";
import { createNodeWorkingTreeAdapter } from "../../src/adapters/node-working-tree-adapter.js";
import { runCli } from "../../src/cli/dispatch.js";
export async function createRealCli() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-m3-"));
    const home = path.join(root, "home");
    await fs.mkdir(home, { recursive: true });
    const fileSystem = createNodeFileSystemAdapter();
    const repositoryDiscovery = createNodeRepositoryDiscoveryAdapter(fileSystem);
    const environment = createNodeEnvironmentAdapter({ HOME: home });
    const workingTree = createNodeWorkingTreeAdapter(fileSystem);
    const ports = { fileSystem, repositoryDiscovery, environment, workingTree };
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
