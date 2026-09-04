import http from "node:http";
import https from "node:https";
/**
 * Node.js HTTP client adapter (SPEC §9).
 * Issues a single GET request without following redirects, returning raw body bytes and status.
 */
export function createNodeHttpClientAdapter() {
    return {
        async get(url) {
            return new Promise((resolve, reject) => {
                const parsedUrl = new URL(url);
                const transport = parsedUrl.protocol === "https:" ? https : http;
                // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- IncomingMessage is a mutable Node library stream.
                const request = transport.get(url, (response) => {
                    const status = response.statusCode ?? 0;
                    const headers = {};
                    for (const [key, val] of Object.entries(response.headers)) {
                        if (val !== undefined) {
                            headers[key.toLowerCase()] = Array.isArray(val) ? val.join(", ") : val;
                        }
                    }
                    const chunks = [];
                    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Buffer chunk from Node stream.
                    response.on("data", (chunk) => {
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
