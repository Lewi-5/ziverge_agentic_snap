import { loadLocalOperand } from "../application/repository/load-local-operand.js";
import { loadRemoteRepository } from "../application/repository/load-remote-repository.js";
import type { DomainError } from "../domain/errors.js";
import type { Result } from "../domain/result.js";
import type { FileSystemPort } from "../ports/filesystem-port.js";
import type { HttpClientPort } from "../ports/http-client-port.js";
import type { LoadedRepositorySource, RepositorySourcePort } from "../ports/repository-source-port.js";

/** M8: local operands resolve through the filesystem; http(s) operands resolve through the one-GET remote loader. */
export function createRepositorySourceAdapter(fileSystem: FileSystemPort, httpClient: HttpClientPort): RepositorySourcePort {
  return {
    async load(source, cwd): Promise<Result<LoadedRepositorySource, DomainError>> {
      if (source.kind === "remote") {
        return loadRemoteRepository(source.url, { httpClient });
      }
      return loadLocalOperand(cwd, source.path, { fileSystem });
    },
  };
}
