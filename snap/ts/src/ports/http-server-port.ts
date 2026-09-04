/**
 * Contract for starting and serving the immutable repository snapshot over HTTP (SPEC §9).
 */

export interface HttpServerOptions {
  readonly host: string;
  readonly port: number;
  readonly snapshotBytes: Uint8Array;
}

export interface HttpServerHandle {
  readonly port: number;
  readonly close: () => Promise<void>;
}

export interface HttpServerPort {
  readonly listen: (options: HttpServerOptions) => Promise<HttpServerHandle>;
}
