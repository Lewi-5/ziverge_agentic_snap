/**
 * Classification of repository operands for merge and cross-repository diff (SPEC §§7.6, 7.8, 9).
 */

export type RepositorySource =
  | { readonly kind: "local"; readonly path: string }
  | { readonly kind: "remote"; readonly url: string };

/**
 * Classifies an operand string as either a remote HTTP(S) URL or a local path.
 * Only exact "http://" and "https://" prefixes are treated as remote sources.
 */
export function classifyRepositorySource(operand: string): RepositorySource {
  if (operand.startsWith("http://") || operand.startsWith("https://")) {
    return { kind: "remote", url: operand };
  }
  return { kind: "local", path: operand };
}
