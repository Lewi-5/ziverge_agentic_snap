import type { DomainError } from "../../domain/errors.js";
import type { Result } from "../../domain/result.js";
import type { FileTree } from "../../domain/tree/change.js";
import type { WorkingTreePort } from "../../ports/working-tree-port.js";

export interface ReadWorkingTreePorts {
  readonly workingTree: WorkingTreePort;
}

/**
 * Scans the working tree at the discovered repository root. Every M3
 * command that needs working-tree bytes (`status`, `commit`, the
 * no-argument `diff`) shares this one orchestration point so the scan root
 * is always the repository root, never `cwd` (module3planCORRECTIONS.md
 * #2).
 */
export async function readWorkingTree(repoRoot: string, ports: ReadWorkingTreePorts): Promise<Result<FileTree, DomainError>> {
  return ports.workingTree.scan(repoRoot);
}
