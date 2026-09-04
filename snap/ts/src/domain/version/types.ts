export interface VersionComponent {
  readonly contributorId: string;
  readonly revision: number;
}

/**
 * Invariant (established only by parseVersion / joinVersions, never by
 * callers constructing one by hand outside the domain layer): components
 * have unique contributor ids, are sorted by compareUnsignedUtf8 on the id,
 * and every revision is a positive safe integer.
 */
export interface Version {
  readonly components: readonly VersionComponent[];
}

export const EMPTY_VERSION: Version = Object.freeze({ components: Object.freeze([]) });

export const MAX_REVISION = Number.MAX_SAFE_INTEGER;
