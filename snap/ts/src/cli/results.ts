import type { DiffRecord } from "../domain/tree/diff-records.js";
import type { TreeDeltaRow } from "../domain/tree/compare.js";
import type { Version } from "../domain/version/types.js";
import type { WarningFact } from "../domain/history/warnings.js";

export interface LogEntry {
  readonly version: Version;
  readonly author: string;
  readonly message: string;
}

/**
 * Semantic command results. Command handlers return these — never rendered
 * strings — so a dedicated renderer (render.ts) owns turning them into exact
 * output bytes. This keeps command handlers free of presentation concerns
 * ahead of M7, which adds a second (terminal/ANSI) renderer without touching
 * any command. `diff` carries M4's `DiffRecord[]` rather than pre-rendered
 * text so a future terminal renderer can style it without recomputing the
 * diff (SPEC §7.11).
 */
export type CommandResult =
  | { readonly kind: "initialized"; readonly version: Version }
  | { readonly kind: "version-info"; readonly version: string }
  | { readonly kind: "silent" }
  | { readonly kind: "status"; readonly version: Version; readonly rows: readonly TreeDeltaRow[] }
  | { readonly kind: "log"; readonly entries: readonly LogEntry[] }
  | { readonly kind: "diff"; readonly records: readonly DiffRecord[] }
  | { readonly kind: "committed"; readonly version: Version }
  | { readonly kind: "reverted"; readonly version: Version }
  | { readonly kind: "merged"; readonly version: Version; readonly warnings: readonly WarningFact[] }
  | { readonly kind: "serve-startup"; readonly url: string };
