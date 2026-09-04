import type { DomainError } from "../../domain/errors.js";
import { ok, type Result } from "../../domain/result.js";
import { serializeRepositoryDocument } from "../../domain/repository/serialize.js";
import type { FileSystemPort } from "../../ports/filesystem-port.js";
import type { HttpServerPort } from "../../ports/http-server-port.js";
import type { RepositoryDiscoveryPort } from "../../ports/repository-discovery-port.js";
import type { SignalPort } from "../../ports/signal-port.js";
import { loadLocalRepository } from "../repository/load-local-repository.js";

export interface ServePorts {
  readonly fileSystem: FileSystemPort;
  readonly repositoryDiscovery: RepositoryDiscoveryPort;
  readonly httpServer: HttpServerPort;
  readonly signal: SignalPort;
}

export interface ServeHandle {
  readonly url: string;
  /** Resolves once a shutdown signal has closed the server and removed its listeners. */
  readonly closed: Promise<void>;
}

/**
 * Validates and snapshots the nearest local repository, then binds a
 * loopback HTTP server to serve it (SPEC §§7.9, 9). Validation completes
 * before any socket is bound; a validation failure returns before touching
 * the network. The returned handle's `url` is ready to publish immediately,
 * and `closed` resolves only after SIGINT/SIGTERM cleanly stops the server.
 */
export async function serve(cwd: string, port: number, ports: ServePorts): Promise<Result<ServeHandle, DomainError>> {
  const loaded = await loadLocalRepository(cwd, ports);
  if (!loaded.ok) return loaded;

  const jsonText = serializeRepositoryDocument(loaded.value.repository.document);
  const snapshotBytes = new TextEncoder().encode(jsonText);

  const handle = await ports.httpServer.listen({ host: "127.0.0.1", port, snapshotBytes });
  const url = `http://127.0.0.1:${String(handle.port)}/repository.json`;

  const closed = new Promise<void>((resolve) => {
    let closing = false;
    const unregister = ports.signal.onSignal(["SIGINT", "SIGTERM"], () => {
      if (closing) return;
      closing = true;
      void handle.close().then(() => {
        unregister();
        resolve();
      });
    });
  });

  return ok({ url, closed });
}
