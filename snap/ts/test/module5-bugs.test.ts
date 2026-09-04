import test from "node:test";
import assert from "node:assert/strict";
import { decodeBase64 } from "../src/domain/content/base64.js";
import { decodeRepositoryDocument } from "../src/domain/repository/schema.js";
import { validateRepository } from "../src/domain/repository/validate.js";
import { selectKnownPatches } from "../src/domain/repository/known-version.js";
import { materializeVersion } from "../src/domain/history/materialize.js";
import { parseVersion } from "../src/domain/version/parse.js";
import { resolveNamespaceConflicts } from "../src/domain/tree/namespace-conflicts.js";
import { integratePatch } from "../src/domain/history/integrate-patch.js";
import { createContributorId } from "../src/domain/version/contributor-id.js";
import { createVersion } from "../src/domain/version/construct.js";
import type { Patch, ValidatedRepository } from "../src/domain/repository/types.js";

const encoder = new TextEncoder();

function parseValidated(value: unknown): ValidatedRepository {
  const decoded = decodeRepositoryDocument(value);
  if (!decoded.ok) throw new Error(decoded.error.detail);
  const validated = validateRepository(decoded.value);
  if (!validated.ok) throw new Error(validated.error.detail);
  return validated.value;
}

// ---------------------------------------------------------------------------
// 1. Canonical Base64 Verification
// ---------------------------------------------------------------------------

test("[M5-Bug-1] base64: rejects non-canonical padding bits and invalid lengths", () => {
  // Non-zero padding bits in "//=="
  const invalidPaddingBits = decodeBase64("//==");
  assert.equal(invalidPaddingBits.ok, false);
  if (!invalidPaddingBits.ok) {
    assert.equal(invalidPaddingBits.error.detail, "invalid canonical base64");
  }

  // Not multiple of 4
  const invalidLength = decodeBase64("abc");
  assert.equal(invalidLength.ok, false);

  // Illegal padding format
  const illegalPadding = decodeBase64("A===");
  assert.equal(illegalPadding.ok, false);

  // Embedded padding
  const embeddedPadding = decodeBase64("AA==AA==");
  assert.equal(embeddedPadding.ok, false);

  // Whitespace not allowed
  const whitespace = decodeBase64(" AAEC ");
  assert.equal(whitespace.ok, false);

  // Empty string is valid 0-byte base64
  const empty = decodeBase64("");
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.value.length, 0);
  }
});

// ---------------------------------------------------------------------------
// 2. Known Version and Omitted Dependency Selection
// ---------------------------------------------------------------------------

test("[M5-Bug-2] selectKnownPatches detects transitive omitted dependencies", () => {
  // A1 -> B1 -> C1, where C1's causal base is (a@x->1, b@x->1)
  const repo = parseValidated({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "a1", changes: [{ type: "put", path: "a", content: "YQ==" }] },
      { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b1", changes: [{ type: "put", path: "b", content: "Yg==" }] },
      { author: "c@x", revision: 1, base: [["a@x", 1], ["b@x", 1]], message: "c1", changes: [{ type: "put", path: "c", content: "Yw==" }] },
    ],
  });

  // Valid: (c@x->1, b@x->1, a@x->1)
  const validV = parseVersion("(a@x->1,b@x->1,c@x->1)");
  assert.equal(validV.ok, true);
  if (validV.ok) {
    const selected = selectKnownPatches(repo, validV.value);
    assert.equal(selected.ok, true);
    if (selected.ok) assert.equal(selected.value.length, 3);
  }

  // Invalid: selects c@x->1 and b@x->1, but omits a@x->1 (transitive dependency of b)
  const omittedTransitive = parseVersion("(b@x->1,c@x->1)");
  assert.equal(omittedTransitive.ok, true);
  if (omittedTransitive.ok) {
    const selected = selectKnownPatches(repo, omittedTransitive.value);
    assert.equal(selected.ok, false);
    if (!selected.ok) {
      assert.match(selected.error.detail, /patch \(b@x, 1\) has an omitted dependency/);
    }
  }

  // Invalid: patch base itself omitting transitive dependency is rejected by validateRepository
  const repoWithOmittedTransitiveBase = {
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "a1", changes: [{ type: "put", path: "a", content: "YQ==" }] },
      { author: "b@x", revision: 1, base: [["a@x", 1]], message: "b1", changes: [{ type: "put", path: "b", content: "Yg==" }] },
      { author: "c@x", revision: 1, base: [["b@x", 1]], message: "c1", changes: [{ type: "put", path: "c", content: "Yw==" }] },
    ],
  };
  const decoded = decodeRepositoryDocument(repoWithOmittedTransitiveBase);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const validated = validateRepository(decoded.value);
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.error.detail, /patch \(b@x, 1\) has an omitted dependency/);
    }
  }

  // Invalid: unknown contributor
  const unknownAuthor = parseVersion("(unknown@x->1)");
  assert.equal(unknownAuthor.ok, true);
  if (unknownAuthor.ok) {
    const selected = selectKnownPatches(repo, unknownAuthor.value);
    assert.equal(selected.ok, false);
    if (!selected.ok) {
      assert.match(selected.error.detail, /missing patch \(unknown@x, 1\)/);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Complex Namespace Collisions: Authored Deletion + Replacement
// ---------------------------------------------------------------------------

test("[M5-Bug-3] namespace: authored deletion in incoming patch does not trigger namespace warning", () => {
  // Current tree has dir/a and dir/b
  const current = new Map([
    ["dir/a", encoder.encode("child a\n")],
    ["dir/b", encoder.encode("child b\n")],
  ]);

  // Incoming patch deletes dir/a and creates dir as a file
  const presentTargets = new Map([["dir", encoder.encode("dir file\n")]]);
  const authoredDeletions = new Set(["dir/a"]);

  const resolution = resolveNamespaceConflicts(current, presentTargets, authoredDeletions);

  // dir/b should conflict and produce a warning
  assert.deepEqual([...resolution.settledIncomingPaths], ["dir"]);
  assert.deepEqual([...resolution.removals], ["dir/b"]);
  assert.deepEqual(resolution.warnings, [{ path: "dir/b", reason: "namespace-wins" }]);
});

test("[M5-Bug-4] namespace: incoming descendant replaces current ancestor", () => {
  const current = new Map([["foo", encoder.encode("plain file\n")]]);
  const presentTargets = new Map([["foo/bar/baz.txt", encoder.encode("nested file\n")]]);
  const authoredDeletions = new Set<string>();

  const resolution = resolveNamespaceConflicts(current, presentTargets, authoredDeletions);

  assert.deepEqual([...resolution.settledIncomingPaths], ["foo/bar/baz.txt"]);
  assert.deepEqual([...resolution.removals], ["foo"]);
  assert.deepEqual(resolution.warnings, [{ path: "foo", reason: "namespace-wins" }]);
});

// ---------------------------------------------------------------------------
// 4. Semantic Validation Precondition Edge Cases
// ---------------------------------------------------------------------------

test("[M5-Bug-5] validateChanges rejects text edit against binary base", () => {
  const repoDoc = {
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "binary", changes: [{ type: "put", path: "img.bin", content: "AAEC" }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "edit text", changes: [{ type: "text", path: "img.bin", edit: [{ delete: 1 }] }] },
    ],
  };
  const decoded = decodeRepositoryDocument(repoDoc);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const validated = validateRepository(decoded.value);
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.error.detail, /text change at path 'img\.bin' requires a text base/);
    }
  }
});

test("[M5-Bug-6] validateChanges rejects under-consumption and over-consumption", () => {
  // Under-consumption: base has 2 tokens, edit only consumes 1
  const under = {
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "base", changes: [{ type: "text", path: "f", edit: [{ insert: ["one\n", "two\n"] }] }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "under", changes: [{ type: "text", path: "f", edit: [{ retain: 1 }] }] },
    ],
  };
  const decodedUnder = decodeRepositoryDocument(under);
  assert.equal(decodedUnder.ok, true);
  if (decodedUnder.ok) {
    const validated = validateRepository(decodedUnder.value);
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.error.detail, /does not consume old content/);
    }
  }

  // Over-consumption: base has 1 token, edit deletes 2
  const over = {
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "base", changes: [{ type: "text", path: "f", edit: [{ insert: ["one\n"] }] }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "over", changes: [{ type: "text", path: "f", edit: [{ delete: 2 }] }] },
    ],
  };
  const decodedOver = decodeRepositoryDocument(over);
  assert.equal(decodedOver.ok, true);
  if (decodedOver.ok) {
    const validated = validateRepository(decodedOver.value);
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.error.detail, /consumes beyond old content/);
    }
  }
});

test("[M5-Bug-7] validateChanges rejects non-canonical token outputs", () => {
  // Inserting a token without LF before an existing token
  const nonCanonical = {
    format: 1,
    frontier: [["a@x", 2]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "base", changes: [{ type: "text", path: "f", edit: [{ insert: ["one\n"] }] }] },
      { author: "a@x", revision: 2, base: [["a@x", 1]], message: "bad", changes: [{ type: "text", path: "f", edit: [{ insert: ["no_lf"] }, { retain: 1 }] }] },
    ],
  };
  const decoded = decodeRepositoryDocument(nonCanonical);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const validated = validateRepository(decoded.value);
    assert.equal(validated.ok, false);
    if (!validated.ok) {
      assert.match(validated.error.detail, /text token 0 must end with LF/);
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Deep Linear Chain Replay
// ---------------------------------------------------------------------------

test("[M5-Bug-8] materializeVersion: linear chain of 20 patches produces correct tree and caching", () => {
  const patches: Record<string, unknown>[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const base = i === 1 ? [] : [["a@x", i - 1]];
    patches.push({
      author: "a@x",
      revision: i,
      base,
      message: `patch ${String(i)}`,
      changes: [{ type: "text", path: `file_${String(i)}.txt`, edit: [{ insert: [`content ${String(i)}\n`] }] }],
    });
  }

  const repo = parseValidated({
    format: 1,
    frontier: [["a@x", 20]],
    patches,
  });

  // Materialize frontier
  const frontierRes = materializeVersion(repo, repo.document.frontier);
  assert.equal(frontierRes.ok, true);
  if (frontierRes.ok) {
    assert.equal(frontierRes.value.tree.size, 20);
    assert.equal(frontierRes.value.warnings.length, 0);
  }

  // Materialize intermediate version (a@x->10)
  const v10 = parseVersion("(a@x->10)");
  assert.equal(v10.ok, true);
  if (v10.ok) {
    const v10Res = materializeVersion(repo, v10.value);
    assert.equal(v10Res.ok, true);
    if (v10Res.ok) {
      assert.equal(v10Res.value.tree.size, 10);
      assert.equal(v10Res.value.tree.has("file_10.txt"), true);
      assert.equal(v10Res.value.tree.has("file_11.txt"), false);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Path Conflict Symmetry: Delete vs Edit
// ---------------------------------------------------------------------------

test("[M5-Bug-9] path conflicts: delete vs edit always resolves to delete", () => {
  const authorA = createContributorId("a@x");
  const authorB = createContributorId("b@x");
  assert.equal(authorA.ok, true);
  assert.equal(authorB.ok, true);
  if (!authorA.ok || !authorB.ok) return;

  const baseTree = new Map([["f.txt", encoder.encode("initial\n")]]);
  const emptyBase = createVersion([]);
  assert.equal(emptyBase.ok, true);
  if (!emptyBase.ok) return;

  const patchDelete: Patch = {
    author: authorA.value,
    revision: 1,
    base: emptyBase.value,
    message: "delete",
    changes: [{ type: "delete", path: "f.txt" }],
  };

  const patchEdit: Patch = {
    author: authorB.value,
    revision: 1,
    base: emptyBase.value,
    message: "edit",
    changes: [{ type: "text", path: "f.txt", edit: [{ delete: 1 }, { insert: ["updated\n"] }] }],
  };

  // Order 1: Delete integrated first, then Edit arrives
  // After delete: current tree has f.txt deleted
  const currentAfterDelete = new Map<string, Uint8Array>();
  const editIntegration = integratePatch(baseTree, currentAfterDelete, patchEdit);
  assert.equal(editIntegration.ok, true);
  if (editIntegration.ok) {
    // Earlier delete wins
    assert.equal(editIntegration.value.tree.has("f.txt"), false);
    assert.deepEqual(editIntegration.value.warnings, [{ path: "f.txt", reason: "delete-wins" }]);
  }

  // Order 2: Edit integrated first, then Delete arrives
  // After edit: current tree has "updated\n"
  const currentAfterEdit = new Map([["f.txt", encoder.encode("updated\n")]]);
  const deleteIntegration = integratePatch(baseTree, currentAfterEdit, patchDelete);
  assert.equal(deleteIntegration.ok, true);
  if (deleteIntegration.ok) {
    // Incoming delete wins
    assert.equal(deleteIntegration.value.tree.has("f.txt"), false);
    assert.deepEqual(deleteIntegration.value.warnings, [{ path: "f.txt", reason: "delete-wins" }]);
  }
});

// ---------------------------------------------------------------------------
// 7. Concurrent Create Tie-Breaking: Snap Order and Later Create Wins
// ---------------------------------------------------------------------------

test("[M5-Bug-10] concurrent create: Snap order tie-break and identical collapse", () => {
  // Case A: Differing creates -> later-create-wins
  const repoDifferent = parseValidated({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "a", changes: [{ type: "put", path: "f.txt", content: "YQ==" }] }, // content: "a"
      { author: "b@x", revision: 1, base: [], message: "b", changes: [{ type: "put", path: "f.txt", content: "Yg==" }] }, // content: "b"
    ],
  });

  // Snap order: b's result is (b@x->1) which has a@x=0, while a's result is (a@x->1) which has a@x=1.
  // So b is scheduled first, a is scheduled second.
  // a is canonically later, so a's content "a" wins!
  const matDiff = materializeVersion(repoDifferent, repoDifferent.document.frontier);
  assert.equal(matDiff.ok, true);
  if (matDiff.ok) {
    assert.equal(new TextDecoder().decode(matDiff.value.tree.get("f.txt")), "a");
    assert.deepEqual(matDiff.value.warnings, [{ path: "f.txt", reason: "later-create-wins" }]);
  }

  // Case B: Identical creates -> collapse with NO warning
  const repoSame = parseValidated({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1]],
    patches: [
      { author: "a@x", revision: 1, base: [], message: "a", changes: [{ type: "put", path: "f.txt", content: "c2FtZQ==" }] },
      { author: "b@x", revision: 1, base: [], message: "b", changes: [{ type: "put", path: "f.txt", content: "c2FtZQ==" }] },
    ],
  });
  const matSame = materializeVersion(repoSame, repoSame.document.frontier);
  assert.equal(matSame.ok, true);
  if (matSame.ok) {
    assert.equal(new TextDecoder().decode(matSame.value.tree.get("f.txt")), "same");
    assert.equal(matSame.value.warnings.length, 0);
  }
});

// ---------------------------------------------------------------------------
// 8. Incompatible Types: Text vs Binary (Put)
// ---------------------------------------------------------------------------

test("[M5-Bug-11] path conflicts: incompatible types text vs put", () => {
  // Base has initial text by z@x:1
  // Alice replaces with binary (put)
  // Bob replaces with text
  // Storage order in patches MUST be sorted by author: a@x, b@x, z@x
  const repo = parseValidated({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["z@x", 1]],
    patches: [
      {
        author: "a@x", revision: 1, base: [["z@x", 1]], message: "alice put binary",
        changes: [{ type: "put", path: "f", content: "AAEC" }],
      },
      {
        author: "b@x", revision: 1, base: [["z@x", 1]], message: "bob text edit",
        changes: [{ type: "text", path: "f", edit: [{ delete: 1 }, { insert: ["bob\n"] }] }],
      },
      {
        author: "z@x", revision: 1, base: [], message: "init",
        changes: [{ type: "text", path: "f", edit: [{ insert: ["init\n"] }] }],
      },
    ],
  });

  // Snap order for concurrent a and b:
  // result(a) is (a@x->1, z@x->1)
  // result(b) is (b@x->1, z@x->1)
  // At a@x: b has 0, a has 1 -> b < a in Snap order.
  // So b (text edit) is scheduled first -> current tree has text "bob\n".
  // Then a (put binary) is scheduled second -> incoming change is "put".
  // Rule 5: incoming put replacement wins (later-put-wins)!
  const mat = materializeVersion(repo, repo.document.frontier);
  assert.equal(mat.ok, true);
  if (mat.ok) {
    const bytes = mat.value.tree.get("f");
    assert.deepEqual(bytes, new Uint8Array([0, 1, 2]));
    assert.deepEqual(mat.value.warnings, [{ path: "f", reason: "later-put-wins" }]);
  }
});

// ---------------------------------------------------------------------------
// 9. Three Concurrent Text Patches Replay with Aggregate OT
// ---------------------------------------------------------------------------

test("[M5-Bug-12] aggregate OT: merges three concurrent text edits without warnings", () => {
  // Storage order in patches MUST be sorted by author: a@x, b@x, c@x, z@x
  const repo = parseValidated({
    format: 1,
    frontier: [["a@x", 1], ["b@x", 1], ["c@x", 1], ["z@x", 1]],
    patches: [
      {
        author: "a@x", revision: 1, base: [["z@x", 1]], message: "insert at start",
        changes: [{ type: "text", path: "doc.txt", edit: [{ insert: ["intro\n"] }, { retain: 4 }] }],
      },
      {
        author: "b@x", revision: 1, base: [["z@x", 1]], message: "delete line2",
        changes: [{ type: "text", path: "doc.txt", edit: [{ retain: 1 }, { delete: 1 }, { retain: 2 }] }],
      },
      {
        author: "c@x", revision: 1, base: [["z@x", 1]], message: "insert at end",
        changes: [{ type: "text", path: "doc.txt", edit: [{ retain: 4 }, { insert: ["outro\n"] }] }],
      },
      {
        author: "z@x", revision: 1, base: [], message: "base text",
        changes: [{ type: "text", path: "doc.txt", edit: [{ insert: ["line1\n", "line2\n", "line3\n", "line4\n"] }] }],
      },
    ],
  });

  const mat = materializeVersion(repo, repo.document.frontier);
  assert.equal(mat.ok, true);
  if (mat.ok) {
    const content = new TextDecoder().decode(mat.value.tree.get("doc.txt"));
    // All 3 concurrent edits survive: intro at start, line2 deleted, outro at end
    assert.equal(content, "intro\nline1\nline3\nline4\noutro\n");
    assert.equal(mat.value.warnings.length, 0);
  }
});

// ---------------------------------------------------------------------------
// 10. Number and Revision Validation Boundaries
// ---------------------------------------------------------------------------

test("[M5-Bug-13] schema rejects invalid numbers in version and revision", () => {
  // Float revision
  const floatRev = decodeRepositoryDocument({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 1.5, base: [], message: "x", changes: [{ type: "put", path: "f", content: "YQ==" }] }],
  });
  assert.equal(floatRev.ok, false);
  if (!floatRev.ok) assert.match(floatRev.error.detail, /positive safe integer/);

  // Zero revision
  const zeroRev = decodeRepositoryDocument({
    format: 1,
    frontier: [["a@x", 0]],
    patches: [],
  });
  assert.equal(zeroRev.ok, false);
  if (!zeroRev.ok) assert.match(zeroRev.error.detail, /positive safe integer/);

  // Overflow revision > MAX_REVISION (9007199254740991)
  const overflowRev = decodeRepositoryDocument({
    format: 1,
    frontier: [["a@x", 1]],
    patches: [{ author: "a@x", revision: 9007199254740992, base: [], message: "x", changes: [{ type: "put", path: "f", content: "YQ==" }] }],
  });
  assert.equal(overflowRev.ok, false);
  if (!overflowRev.ok) assert.match(overflowRev.error.detail, /positive safe integer/);
});

