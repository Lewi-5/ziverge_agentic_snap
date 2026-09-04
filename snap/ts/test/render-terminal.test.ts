import test from "node:test";
import assert from "node:assert/strict";
import {
  renderCommandResultTerminal,
  formatCliErrorLineTerminal,
  formatCliWarningLineTerminal,
} from "../src/cli/render-terminal.js";
import { styleAnsi, ANSI_BOLD, ANSI_CYAN, ANSI_GREEN, ANSI_RED, ANSI_YELLOW, ANSI_DIM, ANSI_MAGENTA } from "../src/cli/ansi.js";
import { EMPTY_VERSION, type Version } from "../src/domain/version/types.js";
import { createVersion } from "../src/domain/version/construct.js";
import type { TextToken } from "../src/domain/content/types.js";

function getVersion(v: ReturnType<typeof createVersion>): Version {
  if (!v.ok) {
    throw new Error(`Failed to create version: ${v.error.detail}`);
  }
  return v.value;
}

test("renders initialized in terminal mode", () => {
  const result = renderCommandResultTerminal({ kind: "initialized", version: EMPTY_VERSION });
  const expected = `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Initialized repository")} ${styleAnsi(ANSI_CYAN, "()")}\n`;
  assert.equal(result, expected);
});

test("renders committed, reverted, and merged in terminal mode", () => {
  const ver = getVersion(createVersion([
    { contributorId: "alice@example.com" as any, revision: 1 },
  ]));

  const committed = renderCommandResultTerminal({ kind: "committed", version: ver });
  assert.equal(
    committed,
    `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Committed")} ${styleAnsi(ANSI_CYAN, "(alice@example.com->1)")}\n`,
  );

  const reverted = renderCommandResultTerminal({ kind: "reverted", version: ver });
  assert.equal(
    reverted,
    `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Reverted")} ${styleAnsi(ANSI_CYAN, "(alice@example.com->1)")}\n`,
  );

  const merged = renderCommandResultTerminal({ kind: "merged", version: ver, warnings: [] });
  assert.equal(
    merged,
    `${styleAnsi(ANSI_GREEN, "✓")} ${styleAnsi(ANSI_BOLD, "Merged")} ${styleAnsi(ANSI_CYAN, "(alice@example.com->1)")}\n`,
  );
});

test("renders clean status in terminal mode", () => {
  const result = renderCommandResultTerminal({ kind: "status", version: EMPTY_VERSION, rows: [] });
  const expected = `${styleAnsi(ANSI_BOLD, "Snap status")}  ${styleAnsi(ANSI_CYAN, "()")}\n\n  ${styleAnsi(ANSI_GREEN, "✓")} Working tree clean\n`;
  assert.equal(result, expected);
});

test("renders dirty status rows in terminal mode with symbols and labels", () => {
  const result = renderCommandResultTerminal({
    kind: "status",
    version: EMPTY_VERSION,
    rows: [
      { code: "A", path: "added.txt" },
      { code: "D", path: "deleted.txt" },
      { code: "M", path: "modified.txt" },
    ],
  });

  const expectedHeader = `${styleAnsi(ANSI_BOLD, "Snap status")}  ${styleAnsi(ANSI_CYAN, "()")}\n\n`;
  const expectedAdded = `  ${styleAnsi(ANSI_GREEN, "+")} added.txt ${styleAnsi(ANSI_DIM, "(added)")}\n`;
  const expectedDeleted = `  ${styleAnsi(ANSI_RED, "\u2212")} deleted.txt ${styleAnsi(ANSI_DIM, "(deleted)")}\n`;
  const expectedModified = `  ${styleAnsi(ANSI_YELLOW, "~")} modified.txt ${styleAnsi(ANSI_DIM, "(modified)")}\n`;

  assert.equal(result, expectedHeader + expectedAdded + expectedDeleted + expectedModified);
});

test("renders log in terminal mode with double LF spacing between entries", () => {
  const ver1 = getVersion(createVersion([{ contributorId: "a@x" as any, revision: 1 }]));
  const ver2 = getVersion(createVersion([{ contributorId: "a@x" as any, revision: 2 }]));

  const result = renderCommandResultTerminal({
    kind: "log",
    entries: [
      { version: ver2, author: "a@x", message: "second\nline" },
      { version: ver1, author: "a@x", message: "first" },
    ],
  });

  const entry1 =
    `${styleAnsi(ANSI_CYAN, "●")} ${styleAnsi(ANSI_BOLD, "second\\nline")}\n` +
    `  ${styleAnsi(ANSI_CYAN, "(a@x->2)")} ${styleAnsi(ANSI_DIM, "by")} ${styleAnsi(ANSI_MAGENTA, "a@x")}\n`;
  const entry2 =
    `${styleAnsi(ANSI_CYAN, "●")} ${styleAnsi(ANSI_BOLD, "first")}\n` +
    `  ${styleAnsi(ANSI_CYAN, "(a@x->1)")} ${styleAnsi(ANSI_DIM, "by")} ${styleAnsi(ANSI_MAGENTA, "a@x")}\n`;

  assert.equal(result, `${entry1}\n${entry2}`);
});

test("renders terminal diff records", () => {
  const result = renderCommandResultTerminal({
    kind: "diff",
    records: [
      {
        kind: "text",
        path: "file.txt",
        oldLabel: "a/file.txt",
        newLabel: "b/file.txt",
        oldTokenCount: 1,
        newTokenCount: 1,
        lines: [
          { kind: "delete", token: "old\n" as TextToken },
          { kind: "insert", token: "new" as TextToken }, // missing final newline
        ],
      },
      {
        kind: "binary",
        path: "image.png",
        oldLabel: "a/image.png",
        newLabel: "b/image.png",
      },
    ],
  });

  assert.ok(result.includes(styleAnsi(ANSI_BOLD, "--- a/file.txt")));
  assert.ok(result.includes(styleAnsi(ANSI_BOLD, "+++ b/file.txt")));
  assert.ok(result.includes(styleAnsi(ANSI_CYAN, "@@ -1,1 +1,1 @@")));
  assert.ok(result.includes(styleAnsi(ANSI_RED, "-old")));
  assert.ok(result.includes(styleAnsi(ANSI_GREEN, "+new")));
  assert.ok(result.includes(styleAnsi(ANSI_DIM, "\\ No newline at end of file")));
  assert.ok(result.includes(styleAnsi(ANSI_YELLOW, "Binary files a/image.png and b/image.png differ")));
});

test("formats CLI error and warning lines in terminal mode", () => {
  const errorFormatted = formatCliErrorLineTerminal("snap: not a Snap repository\n");
  assert.equal(errorFormatted, `${styleAnsi(ANSI_RED, "✗ snap: not a Snap repository")}\n`);

  const warningFormatted = formatCliWarningLineTerminal("something changed\n");
  assert.equal(warningFormatted, `${styleAnsi(ANSI_YELLOW, "⚠")} ${styleAnsi(ANSI_YELLOW, "something changed")}\n`);
});
