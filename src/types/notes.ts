export type BlockType =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "checkbox"
  | "code"
  | "blockquote"
  | "callout"
  | "image"
  | "file"
  | "embed"
  | "spacer"
  | "table"
  | "frontmatter";

export interface Block {
  id: string;
  type: BlockType;
  text?: string;
  indent?: number;
  checked?: boolean;
  lang?: string;
  src?: string;
  alt?: string;
  width?: number;
  filename?: string;
  size?: number | null;
  target?: string;
  heading?: string | null;
  rows?: string[][];
  alignments?: string[];
  calloutType?: string;
  calloutTypeRaw?: string;
  calloutFold?: string;
  title?: string;
  meta?: Record<string, string>;
}

export interface NoteContent {
  title: string;
  blocks: Block[];
}

export interface NoteData {
  id?: string;
  title: string;
  folder?: string | null;
  path?: string[] | null;
  content: NoteContent;
  words?: number;
  created?: string;
  updated?: string;
  _draft?: boolean;
  _syncVersion?: number;
}

export type NoteStore = Record<string, NoteData>;
