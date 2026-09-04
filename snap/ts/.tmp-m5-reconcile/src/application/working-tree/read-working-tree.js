/**
 * Scans the working tree at the discovered repository root. Every M3
 * command that needs working-tree bytes (`status`, `commit`, the
 * no-argument `diff`) shares this one orchestration point so the scan root
 * is always the repository root, never `cwd` (module3planCORRECTIONS.md
 * #2).
 */
export async function readWorkingTree(repoRoot, ports) {
    return ports.workingTree.scan(repoRoot);
}
