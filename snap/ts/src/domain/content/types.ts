export type TextToken = string;

export interface TextContent {
  readonly kind: "text";
  readonly text: string;
  readonly tokens: readonly TextToken[];
  readonly bytes: readonly number[];
}

export interface BinaryContent {
  readonly kind: "binary";
  readonly bytes: readonly number[];
}

export type FileContent = TextContent | BinaryContent;
