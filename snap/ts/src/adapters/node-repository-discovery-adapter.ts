import * as path from "node:path";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { RepositoryDiscoveryPort } from "../ports/repository-discovery-port.js";

export function createNodeRepositoryDiscoveryAdapter(fileSystem: FileSystemPort): RepositoryDiscoveryPort {
  return {
    async findRepositoryRoot(startAbsoluteDir: string): Promise<string | null> {
      let current = startAbsoluteDir;
      for (;;) {
        const snapDir = path.join(current, ".snap");
        const manifestPath = path.join(snapDir, "repository.json");
        if (
          (await fileSystem.isDirectory(snapDir)) &&
          (await fileSystem.pathExists(manifestPath)) &&
          !(await fileSystem.isDirectory(manifestPath))
        ) {
          return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
          return null;
        }
        current = parent;
      }
    },
  };
}
