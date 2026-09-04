/**
 * Discriminated union of typed CLI command requests (SPEC §7).
 * Grammar parsing turns raw argv into one of these requests before dispatch.
 */

export interface InitRequest {
  readonly kind: "init";
  readonly path?: string;
}

export interface ConfigRequest {
  readonly kind: "config";
  readonly isGlobal: boolean;
  readonly key: string;
  readonly value: string;
}

export interface StatusRequest {
  readonly kind: "status";
}

export interface LogRequest {
  readonly kind: "log";
}

export interface CommitRequest {
  readonly kind: "commit";
  readonly message: string;
}

export interface DiffRequest {
  readonly kind: "diff";
  readonly oldVersion?: string;
  readonly newVersion?: string;
  readonly repo?: string;
}

export interface RevertRequest {
  readonly kind: "revert";
  readonly version: string;
}

export interface MergeRequest {
  readonly kind: "merge";
  readonly repository: string;
}

export interface ServeRequest {
  readonly kind: "serve";
  readonly port: number;
}

export interface VersionRequest {
  readonly kind: "version";
}

export type CommandRequest =
  | InitRequest
  | ConfigRequest
  | StatusRequest
  | LogRequest
  | CommitRequest
  | DiffRequest
  | RevertRequest
  | MergeRequest
  | ServeRequest
  | VersionRequest;
