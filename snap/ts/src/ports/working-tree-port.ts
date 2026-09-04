import type { DomainError } from "../domain/errors.js";
import type { Result } from "../domain/result.js";
import type { FileTree } from "../domain/tree/change.js";

export interface WorkingTreePort {
  /**
   * Scans `repositoryRoot` (an absolute path, always the discovered
   * repository root — never `cwd`) into a `FileTree`: every regular file
   * below the root except the root `.snap` metadata subtree, with empty
   * directories invisible (module3planCORRECTIONS.md #2). Fails with the
   * exact SPEC diagnostic `unsupported working tree entry: <path>` on a
   * symlink, FIFO, socket, device, or other non-regular entry, without
   * following it.
   */
  readonly scan: (repositoryRoot: string) => Promise<Result<FileTree, DomainError>>;
}
