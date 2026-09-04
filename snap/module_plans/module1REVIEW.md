# Module 1 Review

## Verdict

Module 1 has the right overall shape and is a credible starting point: it uses a
functional core with explicit ports and Node adapters, centralizes unsigned
UTF-8 ordering, separates semantic command results from rendering, and covers
the main initialization and vector-clock behavior with focused tests.

The review nevertheless found several boundary and verification gaps that
should be closed before later history, replay, and merge modules rely on M1 as a
finished foundation.

## Findings and resolutions

### 1. `Version` was structurally forgeable (P1)

`Version` was an exported structural interface. Any caller could construct an
unsorted, duplicate, zero-revision, unsafe, or mutable value and pass it to
formatting and causal operations that assume validation has already happened.
One test constructed a `Version` directly, demonstrating the escape hatch.

Resolution: make `Version` nominal with a module-private `unique symbol` brand.
Only `EMPTY_VERSION` and the validating `createVersion` constructor create the
type. Add a compile-time negative test and construct all positive fixtures via a
validated producer.

### 2. A Linux-only esbuild binary was a direct dependency (P1)

`@esbuild/linux-x64` was listed directly in `devDependencies`. This makes the
package manifest platform-specific and defeats the intended clean-install
portability. `tsx` already depends on `esbuild`, whose optional dependencies
select the correct platform binary.

Resolution: remove the direct platform package and regenerate the lockfile.

### 3. Repository discovery could accept or traverse symlinks (P2)

Discovery treated any existing non-directory `repository.json` as a manifest,
so a symlink to a file qualified. It also lacked enough filesystem type
information to detect a symlink in an existing component of the path being
walked.

Resolution: add an `entryKind` operation backed by `lstat`, require `.snap` to
be an actual directory and `repository.json` to be an actual regular file, and
reject discovery through an existing symlink path component before inspecting
repository metadata. Add fake and real-filesystem coverage.

### 4. Corrected M1 behavior was incompletely asserted (P2)

The tests parsed `repository.json` but did not assert its exact canonical bytes;
did not exercise `init repo/new/child` from outside an existing repository; and
did not cover symlinked discovery metadata. The unit fake also did not verify
that initialization starts discovery from the resolved target rather than the
process working directory.

Resolution: add exact-byte, resolved-target, outside-to-inside, missing-target,
and symlink discovery assertions. Keep filesystem mocking at the port boundary.

### 5. Test TypeScript was not type-checked (P2)

The production `tsconfig.json` includes only `src/**/*.ts`, while `tsx --test`
transpiles tests without performing a TypeScript check. Type-invalid fixtures
could therefore be reported as a green suite.

Resolution: retain `node:test` because Snap is a dependency-light pure Node CLI,
add an explicit `tsconfig.test.json`, and include its check in `npm run check`.

### 6. M1 was marked complete without the official public gate (P2)

The tracker recorded manual scenario replay because the packaged verifier could
not run on the Windows/WSL setup. The project completion rules require the
actual public verifier before a module is `Complete`.

Resolution: return M1 to `In Progress` until scenarios 01 and 02 pass through
`./snap/verify` on a compatible host or CI. Record local checks separately from
the outstanding public gate.

### 7. Constructor diagnostics could violate the one-line error contract (P3)

`createVersion` interpolated an invalid contributor ID without escaping control
characters. A future repository decoder using this shared constructor could
therefore turn malicious input into a multiline CLI diagnostic.

Resolution: route the invalid ID through the shared control-character escaping
helper and add a regression assertion.

## Positive foundation decisions to preserve

- Keep unsigned UTF-8 ordering centralized in one helper.
- Keep all untrusted version components behind one validating constructor.
- Preserve all four causal comparison outcomes rather than treating concurrency
  as ordering.
- Keep application use cases semantic and free of printing.
- Keep plain rendering centralized so terminal presentation can be added without
  changing command behavior.
- Continue validation and complete preparation before repository mutation.

