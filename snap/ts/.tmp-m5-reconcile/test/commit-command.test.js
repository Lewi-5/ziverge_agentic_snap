import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";
test("commit: creates a patch, advances the frontier, and prints the new version", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/hello.txt", "hello\n");
        const outcome = await cli.run(["commit", "greet"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "(alice@example.com->1)\n");
        assert.equal(outcome.stderr, "");
        const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json"));
        assert.deepEqual(manifest.frontier, [["alice@example.com", 1]]);
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: a clean working tree fails without mutating repository.json", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        const before = await cli.readFile("repo/.snap/repository.json");
        const outcome = await cli.run(["commit", "nothing changed"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stdout, "");
        assert.equal(outcome.stderr, "snap: working tree is clean\n");
        const after = await cli.readFile("repo/.snap/repository.json");
        assert.equal(after, before);
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: an invalid message fails even when the working tree happens to be clean", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        const outcome = await cli.run(["commit", ""], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stdout, "");
        assert.equal(outcome.stderr, "snap: invalid commit message\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: a message over 4096 UTF-8 bytes fails with the exact SPEC diagnostic", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a\n");
        const outcome = await cli.run(["commit", "x".repeat(4097)], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stderr, "snap: invalid commit message\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: exactly 4096 UTF-8 bytes is accepted", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a\n");
        const outcome = await cli.run(["commit", "x".repeat(4096)], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: missing contributor identity fails before any working-tree scan", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.writeFile("repo/a.txt", "a\n");
        const outcome = await cli.run(["commit", "message"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stderr, "snap: contributor.id is required; configure it locally or globally\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: preserves the exact message, including a trailing space", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a\n");
        await cli.run(["commit", "message   "], `${cli.root}/repo`);
        const log = await cli.run(["log"], `${cli.root}/repo`);
        assert.equal(log.stdout, "(alice@example.com->1)\talice@example.com\tmessage   \n");
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: multi-author serial commits in one repository advance only the authoring contributor's frontier component (corrections doc #7)", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a\n");
        await cli.run(["commit", "alice's commit"], `${cli.root}/repo`);
        await cli.run(["config", "contributor.id", "bob@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/b.txt", "b\n");
        const outcome = await cli.run(["commit", "bob's commit"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 0);
        assert.equal(outcome.stdout, "(alice@example.com->1,bob@example.com->1)\n");
        const manifest = JSON.parse(await cli.readFile("repo/.snap/repository.json"));
        assert.deepEqual(manifest.frontier, [
            ["alice@example.com", 1],
            ["bob@example.com", 1],
        ]);
        // Alice commits again: only her component advances, bob's is untouched.
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        await cli.writeFile("repo/a.txt", "a2\n");
        const secondAlice = await cli.run(["commit", "alice again"], `${cli.root}/repo`);
        assert.equal(secondAlice.exitCode, 0);
        assert.equal(secondAlice.stdout, "(alice@example.com->2,bob@example.com->1)\n");
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: an unsupported working tree entry fails without mutating repository.json", async (context) => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        await cli.run(["config", "contributor.id", "alice@example.com"], `${cli.root}/repo`);
        const fs = await import("node:fs/promises");
        try {
            await fs.symlink("missing-target", `${cli.root}/repo/link`);
        }
        catch {
            context.skip("symlink creation is restricted in this environment");
            return;
        }
        const before = await cli.readFile("repo/.snap/repository.json");
        const outcome = await cli.run(["commit", "link"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stderr, "snap: unsupported working tree entry: link\n");
        const after = await cli.readFile("repo/.snap/repository.json");
        assert.equal(after, before);
    }
    finally {
        await cli.cleanup();
    }
});
test("commit: an extra argument is a grammar error", async () => {
    const cli = await createRealCli();
    try {
        await cli.run(["init", "repo"]);
        const outcome = await cli.run(["commit", "a", "b"], `${cli.root}/repo`);
        assert.equal(outcome.exitCode, 1);
        assert.equal(outcome.stderr, "snap: invalid command or arguments\n");
    }
    finally {
        await cli.cleanup();
    }
});
