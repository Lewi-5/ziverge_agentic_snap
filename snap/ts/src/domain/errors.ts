export type ErrorCategory = "validation" | "conflict" | "not-found" | "io";

export interface DomainError {
  readonly category: ErrorCategory;
  readonly detail: string;
}

export function domainError(category: ErrorCategory, detail: string): DomainError {
  return { category, detail };
}

/**
 * Escapes ASCII control characters (and DEL) as `\xHH` so untrusted text
 * interpolated into a one-line diagnostic (an invalid contributor ID, an
 * unknown configuration field) cannot introduce a literal LF/CR and split
 * the required single-line `snap: <detail>` output into multiple lines.
 */
export function escapeControlCharacters(text: string): string {
  let result = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) {
      result += `\\x${codePoint.toString(16).padStart(2, "0")}`;
    } else {
      result += character;
    }
  }
  return result;
}
