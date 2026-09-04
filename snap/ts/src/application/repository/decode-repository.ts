import { decodeUtf8Strict } from "../../domain/json/decode-utf8.js";
import { parseJsonStrict } from "../../domain/json/parse-json-strict.js";
import { decodeRepositoryDocument } from "../../domain/repository/schema.js";
import { serializeRepositoryDocument } from "../../domain/repository/serialize.js";
import type { RepositoryDocument, ValidatedRepository } from "../../domain/repository/types.js";
import { validateRepository } from "../../domain/repository/validate.js";
import type { DomainError } from "../../domain/errors.js";
import type { Result } from "../../domain/result.js";

/** The single strict boundary shared by local, prepared, and future HTTP repository bytes. */
export function decodeAndValidateRepositoryBytes(bytes: Uint8Array): Result<ValidatedRepository, DomainError> {
  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) return decoded;
  const parsed = parseJsonStrict(decoded.value);
  if (!parsed.ok) return parsed;
  const schema = decodeRepositoryDocument(parsed.value);
  if (!schema.ok) return schema;
  return validateRepository(schema.value);
}

/** Re-enters the public serialized boundary before a newly prepared document can be published. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- RepositoryDocument is deeply immutable.
export function validatePreparedRepository(document: RepositoryDocument): Result<ValidatedRepository, DomainError> {
  return decodeAndValidateRepositoryBytes(new TextEncoder().encode(serializeRepositoryDocument(document)));
}
