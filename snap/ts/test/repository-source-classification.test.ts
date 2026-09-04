import test from "node:test";
import assert from "node:assert/strict";
import { classifyRepositorySource } from "../src/application/repository/source.js";

test("classifyRepositorySource correctly categorizes remote and local operands", () => {
  assert.deepEqual(classifyRepositorySource("http://127.0.0.1:8765/repository.json"), {
    kind: "remote",
    url: "http://127.0.0.1:8765/repository.json",
  });

  assert.deepEqual(classifyRepositorySource("https://example.com/repo"), {
    kind: "remote",
    url: "https://example.com/repo",
  });

  assert.deepEqual(classifyRepositorySource("../other-repo"), {
    kind: "local",
    path: "../other-repo",
  });

  assert.deepEqual(classifyRepositorySource("./local/subrepo"), {
    kind: "local",
    path: "./local/subrepo",
  });

  // Does not treat near-URL prefixes as remote
  assert.deepEqual(classifyRepositorySource("http:without-slashes"), {
    kind: "local",
    path: "http:without-slashes",
  });
});
