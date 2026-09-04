import type { Version } from "../domain/version/types.js";

/**
 * Semantic command results. Command handlers return these — never rendered
 * strings — so a dedicated renderer (render.ts) owns turning them into exact
 * output bytes. This keeps command handlers free of presentation concerns
 * ahead of M7, which adds a second (terminal/ANSI) renderer without touching
 * any command.
 */
export type CommandResult =
  | { readonly kind: "initialized"; readonly version: Version }
  | { readonly kind: "version-info"; readonly version: string };
