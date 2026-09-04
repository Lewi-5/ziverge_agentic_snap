export function formatCliErrorLine(detail) {
    return `snap: ${detail}\n`;
}
export function unexpectedErrorDetail(error) {
    return error instanceof Error ? error.message : String(error);
}
