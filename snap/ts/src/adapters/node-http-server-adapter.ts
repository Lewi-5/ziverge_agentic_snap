import http from "node:http";
import type { HttpServerHandle, HttpServerOptions, HttpServerPort } from "../ports/http-server-port.js";

/**
 * Node.js HTTP server adapter serving the immutable repository snapshot (SPEC §9).
 * Binds loopback only, serving GET and HEAD on /repository.json.
 */
export function createNodeHttpServerAdapter(): HttpServerPort {
  return {
    async listen(options: HttpServerOptions): Promise<HttpServerHandle> {
      return new Promise<HttpServerHandle>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Node HTTP request and response are mutable library streams.
        const server = http.createServer((req, res) => {
          // Resolve target path before method matching (SPEC §9)
          if (req.url !== "/repository.json") {
            res.statusCode = 404;
            res.end();
            return;
          }

          if (req.method === "GET") {
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": String(options.snapshotBytes.length),
            });
            res.end(options.snapshotBytes);
            return;
          }

          if (req.method === "HEAD") {
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": String(options.snapshotBytes.length),
            });
            res.end();
            return;
          }

          res.writeHead(405, { Allow: "GET, HEAD" });
          res.end();
        });

        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- Error is a standard Node error object.
        server.on("error", (error) => {
          reject(error);
        });

        server.listen(options.port, options.host, () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            reject(new Error("Unable to determine listening server address"));
            return;
          }
          const actualPort = address.port;

          const handle: HttpServerHandle = {
            port: actualPort,
            async close(): Promise<void> {
              return new Promise<void>((resolveClose) => {
                if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") {
                  server.closeAllConnections();
                }
                server.close(() => {
                  resolveClose();
                });
              });
            },
          };

          resolve(handle);
        });
      });
    },
  };
}
