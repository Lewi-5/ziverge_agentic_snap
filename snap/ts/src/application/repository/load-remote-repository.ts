import { domainError, type DomainError } from "../../domain/errors.js";
import { err, ok, type Result } from "../../domain/result.js";
import type { ValidatedRepository } from "../../domain/repository/types.js";
import type { HttpClientPort } from "../../ports/http-client-port.js";
import { decodeAndValidateRepositoryBytes } from "./decode-repository.js";

export interface LoadedRemoteRepository {
  readonly repository: ValidatedRepository;
}

/**
 * Loads a remote repository with exactly one GET to the supplied URL (SPEC
 * §9): no redirects are followed by the client, HTTP 200 is required, and
 * the raw response bytes cross the same fatal-UTF-8/duplicate-JSON/schema/
 * full-validation boundary local bytes use. No retry is performed for
 * transport, status, or validation failure.
 */
export async function loadRemoteRepository(
  url: string,
  ports: { readonly httpClient: HttpClientPort },
): Promise<Result<LoadedRemoteRepository, DomainError>> {
  let response;
  try {
    response = await ports.httpClient.get(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err(domainError("io", `remote repository request failed: ${detail}`));
  }

  if (response.status !== 200) {
    return err(domainError("io", `remote repository request failed: HTTP ${String(response.status)}`));
  }

  const repository = decodeAndValidateRepositoryBytes(response.body);
  if (!repository.ok) return repository;
  return ok({ repository: repository.value });
}
