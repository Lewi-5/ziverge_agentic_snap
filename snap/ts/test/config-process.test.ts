import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface ProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const IS_EMITTED_JAVASCRIPT = path.extname(fileURLToPath(import.meta.url)) === ".js";
const SNAP_EXECUTABLE = fileURLToPath(new URL("../snap", import.meta.url));
const TSX_CLI = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const MAIN = fileURLToPath(new URL(IS_EMITTED_JAVASCRIPT ? "../src/main.js" : "../src/main.ts", import.meta.url));

function runSnap(args: readonly string[], cwd: string, home: string): Promise<ProcessResult> {
  let command: string;
  let commandArgs: readonly string[];
  if (IS_EMITTED_JAVASCRIPT) {
    command = process.execPath;
    commandArgs = [MAIN, ...args];
  } else if (process.platform === "win32") {
    command = process.execPath;
    commandArgs = [TSX_CLI, MAIN, ...args];
  } else {
    command = "/bin/sh";
    commandArgs = [SNAP_EXECUTABLE, ...args];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

test("config runs through the executable entry point and writes local configuration silently", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-config-process-"));
  try {
    const repoRoot = path.join(root, "repo");
    const snapDirectory = path.join(repoRoot, ".snap");
    await fs.mkdir(snapDirectory, { recursive: true });
    await fs.writeFile(path.join(snapDirectory, "repository.json"), "{}", "utf8");

    const result = await runSnap(["config", "contributor.id", "process@example.com"], repoRoot, root);
    assert.deepEqual(result, { exitCode: 0, stdout: "", stderr: "" });
    assert.equal(
      await fs.readFile(path.join(snapDirectory, "config.json"), "utf8"),
      '{\n  "contributor": {\n    "id": "process@example.com"\n  }\n}\n',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("global config uses HOME through the executable entry point without a repository", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "snap-global-process-"));
  try {
    const home = path.join(root, "home");
    await fs.mkdir(home);

    const result = await runSnap(["config", "--global", "contributor.id", "global@example.com"], root, home);
    assert.deepEqual(result, { exitCode: 0, stdout: "", stderr: "" });
    assert.equal(
      await fs.readFile(path.join(home, ".snapconfig.json"), "utf8"),
      '{\n  "contributor": {\n    "id": "global@example.com"\n  }\n}\n',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
