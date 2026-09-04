import type { CommandResult, LogEntry } from "./results.js";
import type { TreeDeltaRow } from "../domain/tree/compare.js";
import type { DiffRecord, DiffTokenLine } from "../domain/tree/diff-records.js";
import { formatVersion } from "../domain/version/format.js";
import {
  ANSI_BOLD,
  ANSI_CYAN,
  ANSI_DIM,
  ANSI_GREEN,
  ANSI_MAGENTA,
  ANSI_RED,
  ANSI_YELLOW,
  styleAnsi,
} from "./ansi.js";

function escapeLogMessage(message: string): string {
  return message.replaceAll("\\", "\\\\").replaceAll("\t", "\\t").replaceAll("\n", "\\n");
}

function renderTokenLineTerminal(line: DiffTokenLine): string {
  const prefix = line.kind === "context" ? " " : line.kind === "delete" ? "-" : "+";
  const hasLf = line.token.endsWith("\n");
  const content = hasLf ? line.token.slice(0, -1) : line.token;
  const lineText = `${prefix}${content}`;

  let rendered: string;
  if (line.kind === "delete") {
    rendered = `${styleAnsi(ANSI_RED, lineText)}\n`;
  } else if (line.kind === "insert") {
    rendered = `${styleAnsi(ANSI_GREEN, lineText)}\n`;
  } else {
    // Context lines remain unchanged per SPEC §7.11
    rendered = `${lineText}\n`;
  }

  if (!hasLf) {
    rendered += `${styleAnsi(ANSI_DIM, "\\ No newline at end of file")}\n`;
  }
  return rendered;
}

export function renderDiffTerminal(records: readonly DiffRecord[]): string {
  let output = "";
  for (const record of records) {
    if (record.kind === "binary") {
      output += `${styleAnsi(ANSI_YELLOW, `Binary files ${record.oldLabel} and ${record.newLabel} differ`)}\n`;
      continue;
    }
    output += `${styleAnsi(ANSI_BOLD, `--- ${record.oldLabel}`)}\n`;
    output += `${styleAnsi(ANSI_BOLD, `+++ ${record.newLabel}`)}\n`;
    output += `${styleAnsi(ANSI_CYAN, `@@ -1,${String(record.oldTokenCount)} +1,${String(record.newTokenCount)} @@`)}\n`;
    for (const line of record.lines) {
      output += renderTokenLineTerminal(line);
    }
  }
  return output;
}

function renderStatusTerminal(versionStr: string, rows: readonly TreeDeltaRow[]): string {
  let output = `${styleAnsi(ANSI_BOLD, "Snap status")}  ${styleAnsi(ANSI_CYAN, versionStr)}\n\n`;
  if (rows.length === 0) {
    output += `  ${styleAnsi(ANSI_GREEN, "✓")} Working tree clean\n`;
    return output;
  }

  for (const row of rows) {
    let color: typeof ANSI_GREEN | typeof ANSI_RED | typeof ANSI_YELLOW;
    let symbol: string;
    let label: string;

    if (row.code === "A") {
      color = ANSI_GREEN;
      symbol = "+";
      label = "added";
    } else if (row.code === "D") {
      color = ANSI_RED;
      symbol = "\u2212"; // Unicode minus −
      label = "deleted";
    } else {
      color = ANSI_YELLOW;
      symbol = "~";
      label = "modified";
    }

    output += `  ${styleAnsi(color, symbol)} ${row.path} ${styleAnsi(ANSI_DIM, `(${label})`)}\n`;
  }
  return output;
}

function renderLogTerminal(entries: readonly LogEntry[]): string {
  const renderedEntries: string[] = [];
  for (const entry of entries) {
    const versionStr = formatVersion(entry.version);
    const escapedMsg = escapeLogMessage(entry.message);
    const line1 = `${styleAnsi(ANSI_CYAN, "●")} ${styleAnsi(ANSI_BOLD, escapedMsg)}\n`;
    const line2 = `  ${styleAnsi(ANSI_CYAN, versionStr)} ${styleAnsi(ANSI_DIM, "by")} ${styleAnsi(ANSI_MAGENTA, entry.author)}\n`;
    renderedEntries.push(line1 + line2);
  }
  // SPEC §7.11: Entries have one additional LF between them
  return renderedEntries.join("\n");
}

/**
 * Formats a single plain error line in terminal mode (SPEC §7.11):
 * S(31, "✗ " + <error>) + "\n"
 */
export function formatCliErrorLineTerminal(plainErrorLine: string): string {
  const trimmed = plainErrorLine.endsWith("\n") ? plainErrorLine.slice(0, -1) : plainErrorLine;
  return `${styleAnsi(ANSI_RED, `✗ ${trimmed}`)}\n`;
}

/**
 * Formats a plain warning line in terminal mode (SPEC §7.11):
 * S(33, "⚠") + " " + S(33, "<detail>") + "\n"
 */
export function formatCliWarningLineTerminal(detail: string): string {
  const trimmed = detail.endsWith("\n") ? detail.slice(0, -1) : detail;
  return `${styleAnsi(ANSI_YELLOW, "⚠")} ${styleAnsi(ANSI_YELLOW, trimmed)}\n`;
}

/**
 * Formats CommandResult into ANSI terminal presentation (SPEC §7.11).
 */
export function renderCommandResultTerminal(result: CommandResult): string {
  switch (result.kind) {
    case "initialized": {
      const ver = formatVersion(result.version);
      return `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Initialized repository")} ${styleAnsi(ANSI_CYAN, ver)}\n`;
    }
    case "committed": {
      const ver = formatVersion(result.version);
      return `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Committed")} ${styleAnsi(ANSI_CYAN, ver)}\n`;
    }
    case "reverted": {
      const ver = formatVersion(result.version);
      return `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Reverted")} ${styleAnsi(ANSI_CYAN, ver)}\n`;
    }
    case "merged": {
      const ver = formatVersion(result.version);
      return `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Merged")} ${styleAnsi(ANSI_CYAN, ver)}\n`;
    }
    case "version-info":
      return `${styleAnsi(ANSI_BOLD, `snap ${result.version}`)}\n`;
    case "silent":
      return "";
    case "status":
      return renderStatusTerminal(formatVersion(result.version), result.rows);
    case "log":
      return renderLogTerminal(result.entries);
    case "diff":
      return renderDiffTerminal(result.records);
    case "serve-startup":
      // Startup URL always remains plain per SPEC §7.11
      return `${result.url}\n`;
  }
}
