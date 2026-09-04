import http from "node:http";
import https from "node:https";
import type { HttpClientPort, HttpResponse } from "../ports/http-client-port.js";

/**
 * Node.js HTTP client adapter (SPEC §9).
 * Issues a single GET request without following redirects, returning raw body bytes and status.
 */
export function createNodeHttpClientAdapter(): HttpClientPort {
  return {
    async get(url: string): Promise<HttpResponse> {
      return new Promise<HttpResponse>((resolve, reject) => {
        const parsedUrl = new URL(url);
        const transport = parsedUrl.protocol === "https:" ? https : http;

        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- IncomingMessage is a mutable Node library stream.
        const request = transport.get(url, (response) => {
          const status = response.statusCode ?? 0;
          const headers: Record<string, string> = {};

          for (const [key, val] of Object.entries(response.headers)) {
            if (val !== undefined) {
              headers[key.toLowerCase()] = Array.isArray(val) ? val.join(", ") : val;
            }
          }

          const chunks: Buffer[] = [];
          // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Buffer chunk from Node stream.
          response.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          response.on("end", () => {
            const combined = Buffer.concat(chunks);
            resolve({
              status,
              headers,
              body: new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength),
            });
          });

          // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Standard Node error.
          response.on("error", (error) => {
            reject(error);
          });
        });

        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Standard Node error.
        request.on("error", (error) => {
          reject(error);
        });
      });
    },
  };
}
