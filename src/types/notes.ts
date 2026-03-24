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

// ─── Base properties shared by all blocks ─────────────────────────
interface BlockBase {
  id: string;
  text?: string;
  indent?: number;
}

// ─── Discriminated block variants ─────────────────────────────────
interface TextBlock extends BlockBase {
  type: "p" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "blockquote";
}

interface CheckboxBlock extends BlockBase {
  type: "checkbox";
  checked?: boolean;
}

interface CodeBlock extends BlockBase {
  type: "code";
  lang?: string;
}

interface CalloutBlock extends BlockBase {
  type: "callout";
  calloutType?: string;
  calloutTypeRaw?: string;
  calloutFold?: string;
  title?: string;
}

interface ImageBlock extends BlockBase {
  type: "image";
  src?: string;
  alt?: string;
  width?: number;
}

interface FileBlock extends BlockBase {
  type: "file";
  filename?: string;
  size?: number | null;
  src?: string;
}

interface EmbedBlock extends BlockBase {
  type: "embed";
  target?: string;
  heading?: string | null;
}

interface TableBlock extends BlockBase {
  type: "table";
  rows?: string[][];
  alignments?: string[];
}

interface SpacerBlock extends BlockBase {
  type: "spacer";
}

interface FrontmatterBlock extends BlockBase {
  type: "frontmatter";
  meta?: Record<string, string>;
}

export type Block =
  | TextBlock
  | CheckboxBlock
  | CodeBlock
  | CalloutBlock
  | ImageBlock
  | FileBlock
  | EmbedBlock
  | TableBlock
  | SpacerBlock
  | FrontmatterBlock;

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
