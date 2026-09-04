import type { RepositorySource } from "../application/repository/source.js";
import type { DomainError } from "../domain/errors.js";
import type { ValidatedRepository } from "../domain/repository/types.js";
import type { Result } from "../domain/result.js";

export interface LoadedRepositorySource {
  readonly repository: ValidatedRepository;
}

/** M8 extends this adapter boundary with HTTP; merge and diff remain source-neutral. */
export interface RepositorySourcePort {
  readonly load: (source: RepositorySource, cwd: string) => Promise<Result<LoadedRepositorySource, DomainError>>;
}
