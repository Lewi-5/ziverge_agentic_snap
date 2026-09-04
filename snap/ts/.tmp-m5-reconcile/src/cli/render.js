import { renderDiffPlain } from "./render-diff-plain.js";
import { formatVersion } from "../domain/version/format.js";
/**
 * Escapes a log message for plain-mode `log` (SPEC §7.4): backslash, then
 * tab, then LF, escaped in that exact order (module3planCORRECTIONS.md #5)
 * so escaping LF does not double-escape a backslash the tab/LF step just
 * introduced.
 */
function escapeLogMessage(message) {
    return message.replaceAll("\\", "\\\\").replaceAll("\t", "\\t").replaceAll("\n", "\\n");
}
/** Plain-mode rendering (SPEC §§6.4, 7.1-7.10, 10). Terminal mode is added in M7 as a sibling renderer. */
export function renderCommandResult(result) {
    switch (result.kind) {
        case "initialized":
            return `${formatVersion(result.version)}\n`;
        case "version-info":
            return `snap ${result.version}\n`;
        case "silent":
            return "";
        case "committed":
            return `${formatVersion(result.version)}\n`;
        case "status": {
            let output = `version ${formatVersion(result.version)}\n`;
            for (const row of result.rows) {
                output += `${row.code} ${row.path}\n`;
            }
            return output;
        }
        case "log": {
            // SPEC §7.4 (plain mode): records are back-to-back with no blank line
            // between them, unlike §7.11's terminal mode (module3planCORRECTIONS.md #6).
            let output = "";
            for (const entry of result.entries) {
                output += `${formatVersion(entry.version)}\t${entry.author}\t${escapeLogMessage(entry.message)}\n`;
            }
            return output;
        }
        case "reverted":
            return `${formatVersion(result.version)}\n`;
        case "merged":
            return `${formatVersion(result.version)}\n`;
        case "serve-startup":
            return `${result.url}\n`;
        case "diff":
            return renderDiffPlain(result.records);
    }
}
