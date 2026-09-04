import { formatVersion } from "../domain/version/format.js";
import type { CommandResult } from "./results.js";

/** Plain-mode rendering (SPEC §§6.4, 7.1-7.10, 10). Terminal mode is added in M7 as a sibling renderer. */
export function renderCommandResult(result: CommandResult): string {
  switch (result.kind) {
    case "initialized":
      return `${formatVersion(result.version)}\n`;
    case "version-info":
      return `snap ${result.version}\n`;
    case "silent":
      return "";
  }
}
