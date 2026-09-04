import type { ContributorId } from "../version/contributor-id.js";

/** The exact validated shape of `.snap/config.json` / `$HOME/.snapconfig.json` (SPEC §8). */
export interface SnapConfiguration {
  readonly contributor: {
    readonly id: ContributorId;
  };
}
