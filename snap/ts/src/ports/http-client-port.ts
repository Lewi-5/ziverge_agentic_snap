/**
 * Contract for performing single-request HTTP/HTTPS gets without redirects (SPEC §9).
 */

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface HttpClientPort {
  readonly get: (url: string) => Promise<HttpResponse>;
}
