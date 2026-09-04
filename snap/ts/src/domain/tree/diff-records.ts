import { classifyContent } from "../content/classify.js";
import type { TextToken } from "../content/types.js";
import { canonicalDiff } from "../edit/canonical-diff.js";
import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";
import { bytesEqual } from "./change.js";

export interface DiffTokenLine {
  readonly kind: "context" | "delete" | "insert";
  readonly token: TextToken;
}

export interface TextDiffRecord {
  readonly kind: "text";
  readonly path: string;
  readonly oldLabel: string;
  readonly newLabel: string;
  readonly oldTokenCount: number;
  readonly newTokenCount: number;
  readonly lines: readonly DiffTokenLine[];
}

export interface BinaryDiffRecord {
  readonly kind: "binary";
  readonly path: string;
  readonly oldLabel: string;
  readonly newLabel: string;
}

export type DiffRecord = TextDiffRecord | BinaryDiffRecord;

function label(side: "a" | "b", path: string, present: boolean): string {
  return present ? `${side}/${path}` : "/dev/null";
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- ReadonlyMap is immutable; Uint8Array is the configured byte-container exception.
export function buildDiffRecords(oldTree: ReadonlyMap<string, Uint8Array>, newTree: ReadonlyMap<string, Uint8Array>): readonly DiffRecord[] {
  const paths = sortByUnsignedUtf8([...new Set([...oldTree.keys(), ...newTree.keys()])], (path) => path);
  const records: DiffRecord[] = [];
  for (const path of paths) {
    const oldBytes = oldTree.get(path);
    const newBytes = newTree.get(path);
    if (oldBytes !== undefined && newBytes !== undefined && bytesEqual(oldBytes, newBytes)) continue;

    const oldContent = oldBytes === undefined ? undefined : classifyContent(oldBytes);
    const newContent = newBytes === undefined ? undefined : classifyContent(newBytes);
    const oldLabel = label("a", path, oldBytes !== undefined);
    const newLabel = label("b", path, newBytes !== undefined);
    if (oldContent?.kind === "binary" || newContent?.kind === "binary") {
      records.push(Object.freeze({ kind: "binary", path, oldLabel, newLabel }));
      continue;
    }

    const oldTokens = oldContent?.tokens ?? [];
    const newTokens = newContent?.tokens ?? [];
    const lines: DiffTokenLine[] = [];
    let oldCursor = 0;
    for (const operation of canonicalDiff(oldTokens, newTokens)) {
      if ("retain" in operation) {
        for (const token of oldTokens.slice(oldCursor, oldCursor + operation.retain)) lines.push(Object.freeze({ kind: "context", token }));
        oldCursor += operation.retain;
      } else if ("delete" in operation) {
        for (const token of oldTokens.slice(oldCursor, oldCursor + operation.delete)) lines.push(Object.freeze({ kind: "delete", token }));
        oldCursor += operation.delete;
      } else {
        for (const token of operation.insert) lines.push(Object.freeze({ kind: "insert", token }));
      }
    }
    records.push(Object.freeze({
      kind: "text",
      path,
      oldLabel,
      newLabel,
      oldTokenCount: oldTokens.length,
      newTokenCount: newTokens.length,
      lines: Object.freeze(lines),
    }));
  }
  return Object.freeze(records);
}
