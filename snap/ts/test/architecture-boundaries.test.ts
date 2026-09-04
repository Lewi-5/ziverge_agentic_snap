import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

/**
 * Enforces the one-way layering from PLAN.md's architecture diagram by statically
 * auditing every production import. This is a regression guard, not a linter
 * replacement: it fails loudly the moment a file crosses a boundary the plan
 * forbids, so a layering violation cannot silently reappear during future work.
 *
 * Layers, from innermost to outermost:
 *   domain      - pure value transformations; imports only other domain files.
 *   ports       - I/O interface contracts; may depend on domain, never on an
 *                 adapter, application use case, or CLI/HTTP interface.
 *   adapters    - Node.js implementations of ports; may depend on domain, ports,
 *                 and node:* built-ins, but never reach into application or cli
 *                 (that would let infrastructure make application decisions).
 *   application - use cases; may depend on domain, ports, and the cli layer's
 *                 presentation-only result types (PLAN.md's "Application use
 *                 cases --------> Output presentation" edge), plus node:path for
 *                 pure, side-effect-free path arithmetic. Never imports adapters
 *                 directly - main.ts wires the concrete adapter into a port.
 *   cli         - argument parsing, dispatch, and rendering; may depend on
 *                 domain, ports, and application. Never imports adapters
 *                 directly for the same reason.
 *   main        - the composition root; exempt from these rules.
 */

const SRC_ROOT = path.resolve(url.fileURLToPath(new URL(".", import.meta.url)), "../src");

type Layer = "domain" | "ports" | "adapters" | "application" | "cli" | "main";

function layerOf(relativeFromSrc: string): Layer {
  const first = relativeFromSrc.split(path.sep)[0];
  if (first === "domain") return "domain";
  if (first === "ports") return "ports";
  if (first === "adapters") return "adapters";
  if (first === "application") return "application";
  if (first === "cli") return "cli";
  return "main";
}

const ALLOWED_LAYER_IMPORTS: Record<Layer, ReadonlySet<Layer>> = {
  domain: new Set(["domain"]),
  ports: new Set(["domain", "ports"]),
  adapters: new Set(["domain", "ports", "adapters"]),
  application: new Set(["domain", "ports", "application", "cli"]),
  cli: new Set(["domain", "ports", "application", "cli"]),
  main: new Set(["domain", "ports", "adapters", "application", "cli", "main"]),
};

/** node:path is pure string arithmetic (no filesystem/process/env/network access), so it is exempt everywhere. */
const NODE_BUILTIN_EXEMPTIONS: ReadonlySet<Layer> = new Set(["adapters", "cli", "main"]);

interface SourceFile {
  readonly relativePath: string;
  readonly layer: Layer;
  readonly imports: readonly string[];
}

function listSourceFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /(?:^|\n)\s*import\s+(?:type\s+)?[^;]*?\s+from\s+"([^"]+)"/g;
  const sideEffectRegex = /(?:^|\n)\s*import\s+"([^"]+)"/g;
  for (const match of source.matchAll(importRegex)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  for (const match of source.matchAll(sideEffectRegex)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

function loadSourceFiles(): readonly SourceFile[] {
  return listSourceFiles(SRC_ROOT).map((fullPath) => {
    const relativePath = path.relative(SRC_ROOT, fullPath);
    const source = fs.readFileSync(fullPath, "utf8");
    return { relativePath, layer: layerOf(relativePath), imports: extractImportSpecifiers(source) };
  });
}

test("architecture boundaries: every production import stays within PLAN.md's allowed layer edges", () => {
  const files = loadSourceFiles();
  assert.ok(files.length > 10, "expected the source tree to be discoverable from the test file");

  const violations: string[] = [];
  for (const file of files) {
    const fileDirectory = path.join(SRC_ROOT, path.dirname(file.relativePath));
    for (const specifier of file.imports) {
      if (specifier.startsWith("node:")) {
        if (specifier === "node:path" && NODE_BUILTIN_EXEMPTIONS.has(file.layer)) continue;
        if (specifier === "node:path" && file.layer === "application") continue;
        if (file.layer === "domain" || file.layer === "ports") {
          violations.push(`${file.relativePath}: domain/ports must not import ${specifier}`);
        }
        continue;
      }
      if (!specifier.startsWith(".")) continue; // a bare specifier would be a runtime dependency; audited separately below.
      const resolvedAbsolute = path.normalize(path.join(fileDirectory, specifier));
      const resolvedRelative = path.relative(SRC_ROOT, resolvedAbsolute);
      const targetLayer = layerOf(resolvedRelative);
      if (!ALLOWED_LAYER_IMPORTS[file.layer].has(targetLayer)) {
        violations.push(`${file.relativePath} (${file.layer}) imports ${resolvedRelative} (${targetLayer})`);
      }
    }
  }

  assert.deepEqual(violations, [], `layering violations found:\n${violations.join("\n")}`);
});

test("architecture boundaries: production code imports only node built-ins and project-relative modules", () => {
  const files = loadSourceFiles();
  const violations: string[] = [];
  for (const file of files) {
    for (const specifier of file.imports) {
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      violations.push(`${file.relativePath} imports non-built-in package "${specifier}"`);
    }
  }
  assert.deepEqual(violations, [], `non-built-in production imports found:\n${violations.join("\n")}`);
});

test("architecture boundaries: the SPEC §5 delete-on-tie recurrence exists in exactly one file", () => {
  // A regex on function *names* would false-positive on legitimate orchestration
  // (application/commands/diff.ts, cli/render-diff-plain.ts) that merely calls or
  // renders the domain's diff output. Instead, key on the recurrence's own
  // distinctive tie-break comparison text, which only a second real
  // implementation of the DP table would plausibly reproduce.
  const files = loadSourceFiles();
  const tieBreak = /at\(i \+ 1, j\) <= at\(i, j \+ 1\)|D\(i \+ 1, j\) <= D\(i, j \+ 1\)/;
  const matches = files.filter((file) => tieBreak.test(fs.readFileSync(path.join(SRC_ROOT, file.relativePath), "utf8")));
  assert.deepEqual(matches.map((file) => file.relativePath), [path.join("domain", "edit", "canonical-diff.ts")]);
});
