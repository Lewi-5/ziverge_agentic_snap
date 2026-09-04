/**
 * Contract for an awaited, immediately flushed stdout write (SPEC §9). Used
 * only by the long-running `serve` command, which must publish its startup
 * URL before entering the signal wait rather than after the process exits.
 */
export interface OutputPort {
  readonly write: (text: string) => Promise<void>;
}
