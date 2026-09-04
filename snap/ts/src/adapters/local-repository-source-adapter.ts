import { loadLocalOperand } from "../application/repository/load-local-operand.js";
import { domainError, type DomainError } from "../domain/errors.js";
import { err, type Result } from "../domain/result.js";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { LoadedRepositorySource, RepositorySourcePort } from "../ports/repository-source-port.js";

/** M6 local source adapter. M8 replaces/extends this boundary with exact HTTP loading. */
export function createLocalRepositorySourceAdapter(fileSystem: FileSystemPort): RepositorySourcePort {
  return {
    async load(source, cwd): Promise<Result<LoadedRepositorySource, DomainError>> {
      if (source.kind === "remote") {
        return err(domainError("validation", "remote repository loading is not yet implemented"));
      }
      return loadLocalOperand(cwd, source.path, { fileSystem });
    },
  };
}
