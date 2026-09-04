# Snap acceptance-test platform notes

The complete language-neutral acceptance suite contains 28 scenarios.

## Expected results

- Linux, macOS, and WSL: **28/28 passing**.
- Native Windows: **24/28 passing**, with up to four expected platform-specific failures.

Run the suite from `snap/` with:

```bash
./verify --lang ts
```

Use a POSIX host, including WSL, for the release gate. A native-Windows run is a
useful smoke test but is not the authoritative full-suite result.

## Expected native-Windows failures

### `08-unsupported-entries.yaml`

Scenario: **working tree scans reject symlinks and special files without mutation**.

The failing step creates a FIFO with Git Bash/MSYS `mkfifo`. Windows and NTFS do
not provide a native POSIX FIFO file type, so MSYS represents it as an emulated
regular file. A native Win32 Node.js process consequently reports
`lstat().isFIFO() === false`, and Snap cannot identify that fixture as a FIFO.
The same candidate detects and rejects the real FIFO correctly on POSIX systems.

### `12-http-server.yaml`

Scenario: **server exposes one immutable repository snapshot and exits on SIGTERM**.

Native Windows does not deliver POSIX `SIGTERM` to child processes. The harness
must use Windows process termination instead, so the server cannot observe the
requested signal and perform the graceful exit asserted by this scenario.

### `13-http-client.yaml`

Scenario: **HTTP merge and diff use one exact validated GET without redirects**.

This scenario starts a background repository server and later stops it with a
POSIX signal. The HTTP assertions pass, but native Windows cannot reproduce the
required graceful signal shutdown semantics.

### `28-terminal-presentation.yaml`

Scenario: **terminal presentation is colorful readable and explicitly controllable**.

This scenario also starts a background server and verifies graceful shutdown.
Its presentation assertions are portable; only the POSIX signal-driven stop step
is expected to fail on native Windows.

These failures describe host limitations in the test fixtures and process-control
shim. They are not evidence of four Snap application defects. If any other
scenario fails, or one of these scenarios fails for a different reason, treat it
as a real regression and investigate it normally.
