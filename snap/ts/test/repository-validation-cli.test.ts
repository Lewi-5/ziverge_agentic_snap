import test from "node:test";
import assert from "node:assert/strict";
import { createRealCli } from "./support/real-cli.js";

test("status routes every repository through the full M5 validation boundary", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.writeFile("repo/keep.txt", "working bytes stay untouched\n");
    const repositoryPath = "repo/.snap/repository.json";

    const cases: readonly (readonly [string, string | Readonly<Record<string, unknown>>, RegExp])[] = [
      ["duplicate key", '{"format":1,"format":1,"frontier":[],"patches":[]}', /duplicate JSON key/],
      ["unknown field", { format: 1, frontier: [], patches: [], unknown: true }, /^snap: repository has unknown field: unknown\n$/],
      ["gap", {
        format: 1, frontier: [["a@x", 2]],
        patches: [{ author: "a@x", revision: 2, base: [["a@x", 1]], message: "gap", changes: [{ type: "text", path: "f", edit: [] }] }],
      }, /missing a@x/],
      ["unreachable", {
        format: 1, frontier: [],
        patches: [{ author: "a@x", revision: 1, base: [], message: "extra", changes: [{ type: "text", path: "f", edit: [] }] }],
      }, /^snap: unreachable patch:/],
      ["cycle", {
        format: 1, frontier: [["a@x", 1], ["b@x", 1]],
        patches: [
          { author: "a@x", revision: 1, base: [["b@x", 1]], message: "a", changes: [{ type: "text", path: "a", edit: [] }] },
          { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b", changes: [{ type: "text", path: "b", edit: [] }] },
        ],
      }, /^snap: cyclic or incomplete patch history\n$/],
      ["delete absent", {
        format: 1, frontier: [["a@x", 1]],
        patches: [{ author: "a@x", revision: 1, base: [], message: "d", changes: [{ type: "delete", path: "f" }] }],
      }, /^snap: delete of absent path: f\n$/],
      ["prefix conflict", {
        format: 1, frontier: [["a@x", 1]],
        patches: [{ author: "a@x", revision: 1, base: [], message: "p", changes: [
          { type: "put", path: "a", content: "YQ==" },
          { type: "put", path: "a/b", content: "Yg==" },
        ] }],
      }, /tree paths conflict/],
      ["no-op", {
        format: 1, frontier: [["a@x", 2]],
        patches: [
          { author: "a@x", revision: 1, base: [], message: "one", changes: [{ type: "put", path: "f", content: "YQ==" }] },
          { author: "a@x", revision: 2, base: [["a@x", 1]], message: "two", changes: [{ type: "put", path: "f", content: "YQ==" }] },
        ],
      }, /no-op change/],
    ];

    for (const [name, document, diagnostic] of cases) {
      await cli.writeFile(repositoryPath, typeof document === "string" ? document : JSON.stringify(document));
      const result = await cli.run(["status"], `${cli.root}/repo`);
      assert.equal(result.exitCode, 1, name);
      assert.equal(result.stdout, "", name);
      assert.match(result.stderr, diagnostic, name);
      assert.equal(await cli.readFile("repo/keep.txt"), "working bytes stay untouched\n", name);
    }
  } finally {
    await cli.cleanup();
  }
});

test("status accepts a causal branch and materializes its canonical frontier", async () => {
  const cli = await createRealCli();
  try {
    await cli.run(["init", "repo"]);
    await cli.writeFile("repo/.snap/repository.json", JSON.stringify({
      format: 1,
      frontier: [["a@x", 1], ["b@x", 1]],
      patches: [
        { author: "a@x", revision: 1, base: [], message: "a", changes: [{ type: "text", path: "f", edit: [{ insert: ["same\n"] }] }] },
        { author: "b@x", revision: 1, base: [], message: "b", changes: [{ type: "text", path: "f", edit: [{ insert: ["same\n"] }] }] },
      ],
    }));
    const result = await cli.run(["status"], `${cli.root}/repo`);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "version (a@x->1,b@x->1)\nD f\n");
    assert.equal(result.stderr, "");
  } finally {
    await cli.cleanup();
  }
});
