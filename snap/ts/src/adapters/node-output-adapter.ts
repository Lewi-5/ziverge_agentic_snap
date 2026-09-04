import type { OutputPort } from "../ports/output-port.js";

/** Writes directly to the real process stdout and awaits the write callback, guaranteeing a flush before returning. */
export function createNodeOutputAdapter(): OutputPort {
  return {
    async write(text: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Standard Node error, or undefined.
        process.stdout.write(text, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
