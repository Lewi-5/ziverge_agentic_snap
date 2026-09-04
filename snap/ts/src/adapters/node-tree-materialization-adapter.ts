import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TreeMutationPlan } from "../domain/tree/mutation-plan.js";
import type { TreeMaterializationPort } from "../ports/tree-materialization-port.js";

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function nativePath(repositoryRoot: string, trackedPath: string): string {
  if (trackedPath === ".snap" || trackedPath.startsWith(".snap/")) {
    throw new Error("refusing to materialize Snap metadata");
  }
  const resolvedRoot = path.resolve(repositoryRoot);
  const resolved = path.resolve(resolvedRoot, ...trackedPath.split("/"));
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`tracked path escapes repository: ${trackedPath}`);
  return resolved;
}

async function kind(target: string): Promise<"missing" | "file" | "directory" | "unsupported"> {
  try {
    const stat = await fs.lstat(target);
    if (stat.isFile()) return "file";
    if (stat.isDirectory()) return "directory";
    return "unsupported";
  } catch (error) {
    if (isErrno(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) return "missing";
    throw error;
  }
}

async function ensureParents(repositoryRoot: string, trackedPath: string): Promise<void> {
  const segments = trackedPath.split("/").slice(0, -1);
  let current = path.resolve(repositoryRoot);
  for (const segment of segments) {
    current = path.join(current, segment);
    const currentKind = await kind(current);
    if (currentKind === "missing") {
      await fs.mkdir(current);
    } else if (currentKind !== "directory") {
      throw new Error(`unsupported working tree entry: ${trackedPath}`);
    }
  }
}

async function pruneParents(repositoryRoot: string, trackedPaths: readonly string[]): Promise<void> {
  const root = path.resolve(repositoryRoot);
  const candidates = new Set<string>();
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  for (const trackedPath of trackedPaths) {
    let directory = path.dirname(nativePath(root, trackedPath));
    while (directory !== root && directory.startsWith(prefix)) {
      candidates.add(directory);
      directory = path.dirname(directory);
    }
  }
  const ordered = [...candidates].sort((left, right) => right.split(path.sep).length - left.split(path.sep).length);
  for (const directory of ordered) {
    const directoryKind = await kind(directory);
    if (directoryKind === "missing") continue;
    if (directoryKind !== "directory") throw new Error(`unsupported working tree entry: ${path.relative(root, directory).replaceAll(path.sep, "/")}`);
    try {
      await fs.rmdir(directory);
    } catch (error) {
      if (isErrno(error) && (error.code === "ENOTEMPTY" || error.code === "EEXIST" || error.code === "ENOENT")) continue;
      throw error;
    }
  }
}

/** Binary-safe materializer. Conflict decisions remain in the pure replay/domain layer. */
export function createNodeTreeMaterializationAdapter(): TreeMaterializationPort {
  return {
    async apply(repositoryRoot: string, plan: TreeMutationPlan): Promise<void> {
      for (const trackedPath of plan.removals) {
        const target = nativePath(repositoryRoot, trackedPath);
        if (await kind(target) !== "file") throw new Error(`unsupported working tree entry: ${trackedPath}`);
        await fs.unlink(target);
      }
      await pruneParents(repositoryRoot, plan.removals);
      for (const write of plan.writes) {
        await ensureParents(repositoryRoot, write.path);
        const target = nativePath(repositoryRoot, write.path);
        const targetKind = await kind(target);
        if (targetKind === "directory" || targetKind === "unsupported") {
          throw new Error(`unsupported working tree entry: ${write.path}`);
        }
        await fs.writeFile(target, write.bytes);
      }
    },
  };
}
