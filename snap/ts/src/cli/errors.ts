export function formatCliErrorLine(detail: string): string {
  return `snap: ${detail}\n`;
}

export function unexpectedErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
