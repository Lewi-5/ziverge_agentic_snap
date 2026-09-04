import type { SnapConfiguration } from "./types.js";

/** Canonical configuration document bytes: 2-space indent, trailing LF (SPEC §8). */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- ContributorId's brand intersection nested in an object type is not recognized as readonly by this rule.
export function serializeConfiguration(config: SnapConfiguration): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
