import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { initRepository } from "../src/application/init-repository.js";
function recordingFileSystem() {
    const writes = new Map();
    const mkdirs = [];
    return {
        writes,
        mkdirs,
        entryKind: () => Promise.resolve("missing"),
        pathExists: () => Promise.resolve(false),
        isDirectory: () => Promise.resolve(false),
        mkdirRecursive: (targetPath) => {
            mkdirs.push(targetPath);
            return Promise.resolve();
        },
        writeFile: (targetPath, contents) => {
            writes.set(targetPath, contents);
            return Promise.resolve();
        },
        readFileIfExists: () => Promise.resolve(null),
        writeFileDurable: (targetPath, contents) => {
            writes.set(targetPath, contents);
            return Promise.resolve();
        },
        renameFile: () => Promise.resolve(),
        removeFileIfExists: () => Promise.resolve(),
        listDirectory: () => Promise.resolve([]),
    };
}
function discoveryReturning(root, starts) {
    return {
        findRepositoryRoot: (start) => {
            starts?.push(start);
            return Promise.resolve(root);
        },
    };
}
const CWD = path.parse(process.cwd()).root;
test("success: creates directory, .snap, and repository.json; returns the empty version", async () => {
    const target = path.join(CWD, "repo");
    const fileSystem = recordingFileSystem();
    const discoveryStarts = [];
    const result = await initRepository({ cwd: CWD, targetPath: "repo" }, { fileSystem, repositoryDiscovery: discoveryReturning(null, discoveryStarts) });
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.deepEqual(result.value.version, { components: [] });
    }
    assert.deepEqual(fileSystem.mkdirs, [target, path.join(target, ".snap")]);
    assert.deepEqual(discoveryStarts, [target]);
    const written = fileSystem.writes.get(path.join(target, ".snap", "repository.json"));
    assert.notEqual(written, undefined);
    assert.equal(written, '{\n  "format": 1,\n  "frontier": [],\n  "patches": []\n}\n');
    assert.deepEqual(JSON.parse(written ?? ""), { format: 1, frontier: [], patches: [] });
});
test("already initialized: fails with 'repository already exists' and makes no filesystem calls", async () => {
    const target = path.join(CWD, "repo");
    const fileSystem = recordingFileSystem();
    const result = await initRepository({ cwd: CWD, targetPath: "repo" }, { fileSystem, repositoryDiscovery: discoveryReturning(target) });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.detail, "repository already exists");
    }
    assert.deepEqual(fileSystem.mkdirs, []);
    assert.equal(fileSystem.writes.size, 0);
});
test("inside an existing repository: fails with 'cannot initialize inside repository' and makes no filesystem calls", async () => {
    const fileSystem = recordingFileSystem();
    const result = await initRepository({ cwd: CWD, targetPath: "repo/child" }, { fileSystem, repositoryDiscovery: discoveryReturning(path.join(CWD, "repo")) });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.detail, "cannot initialize inside repository");
    }
    assert.deepEqual(fileSystem.mkdirs, []);
    assert.equal(fileSystem.writes.size, 0);
});
test("nested nonexistent path succeeds and creates the full nested directory", async () => {
    const target = path.join(CWD, "new", "repository");
    const fileSystem = recordingFileSystem();
    const result = await initRepository({ cwd: CWD, targetPath: "new/repository" }, { fileSystem, repositoryDiscovery: discoveryReturning(null) });
    assert.equal(result.ok, true);
    assert.deepEqual(fileSystem.mkdirs, [target, path.join(target, ".snap")]);
});
