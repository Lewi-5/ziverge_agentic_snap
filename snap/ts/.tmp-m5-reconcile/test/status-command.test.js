import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";
test("status: clean repository prints only the version line", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        const outcome = await cli.run(["status"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "version ()\n");
        assert.equal(outcome.stderr, "");
    }
    finally {
        await cli.cleanup();
    }
});
test("status: added paths are sorted by unsigned UTF-8 path bytes", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.writeFile("repo/z.txt", "z\n");
        await cli.writeFile("repo/a.txt", "a\n");
        const outcome = await cli.run(["status"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "version ()\nA a.txt\nA z.txt\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("status: after a commit, rows sort by path regardless of A/M/D code", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a\n");
        await cli.writeFile("repo/z.txt", "z\n");
        await cli.run(["commit", "initial"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "changed\n");
        await cli.writeFile("repo/m.txt", "middle\n");
        await cli.removeFile("repo/z.txt");
        const outcome = await cli.run(["status"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "version (alice@example.com->1)\nM a.txt\nA m.txt\nD z.txt\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("status: empty directories are invisible and do not make the tree dirty", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        const fs = await import("node:fs/promises");
        await fs.mkdir(`${cli.root}/repo/empty/nested`, { recursive: true });
        const outcome = await cli.run(["status"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "version ()\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("status: not a repository fails with the discovery error", async () => {
    const cli = await createRealCli();
    try {
        const outcome = await cli.run(["status"]);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stdout, "");
        assert.equal(outcome.stderr, "snap: not a Snap repository\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("status: an extra argument is a grammar error", async () => {
    const cli = await createRealCli();
    try {
        const outcome = await cli.run(["status", "extra"]);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stderr, "snap: invalid command or arguments\n");
    }
    finally {
        await cli.cleanup();
    }
});
