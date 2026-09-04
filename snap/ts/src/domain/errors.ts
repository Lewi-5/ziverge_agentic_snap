export type ErrorCategory = "validation" | "conflict" | "not-found" | "io";

export interface DomainError {
  readonly category: ErrorCategory;
  readonly detail: string;
}

export function domainError(category: ErrorCategory, detail: string): DomainError {
  return { category, detail };
}
