import { encodeBase64 } from "../content/base64.js";
import { classifyContent } from "../content/classify.js";
import { canonicalDiff } from "../edit/canonical-diff.js";
import type { EditScript } from "../edit/types.js";
import { sortByUnsignedUtf8 } from "../unsigned-utf8.js";

export type FileTree = ReadonlyMap<string, Uint8Array>;

export interface TextChange {
  readonly type: "text";
  readonly path: string;
  readonly edit: EditScript;
}

export interface PutChange {
  readonly type: "put";
  readonly path: string;
  readonly content: string;
}

export interface DeleteChange {
  readonly type: "delete";
  readonly path: string;
}

export type AuthoredChange = TextChange | PutChange | DeleteChange;

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- ReadonlyMap is immutable; Uint8Array is the configured byte-container exception.
export function selectAuthoredChanges(current: ReadonlyMap<string, Uint8Array>, target: ReadonlyMap<string, Uint8Array>): readonly AuthoredChange[] {
  const paths = sortByUnsignedUtf8([...new Set([...current.keys(), ...target.keys()])], (path) => path);
  const changes: AuthoredChange[] = [];
  for (const path of paths) {
    const oldBytes = current.get(path);
    const newBytes = target.get(path);
    if (oldBytes !== undefined && newBytes !== undefined && bytesEqual(oldBytes, newBytes)) continue;
    if (newBytes === undefined) {
      changes.push(Object.freeze({ type: "delete", path }));
      continue;
    }

    const newContent = classifyContent(newBytes);
    const oldContent = oldBytes === undefined ? undefined : classifyContent(oldBytes);
    if (newContent.kind === "text" && (oldContent === undefined || oldContent.kind === "text")) {
      changes.push(Object.freeze({
        type: "text",
        path,
        edit: canonicalDiff(oldContent?.tokens ?? [], newContent.tokens),
      }));
    } else {
      changes.push(Object.freeze({ type: "put", path, content: encodeBase64(newBytes) }));
    }
  }
  return Object.freeze(changes);
}
