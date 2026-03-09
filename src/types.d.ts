export interface Block {
  id: string;
  type:
    | "p"
    | "h1"
    | "h2"
    | "h3"
    | "bullet"
    | "numbered"
    | "checkbox"
    | "spacer"
    | "image"
    | "file"
    | "frontmatter"
    | "code"
    | "callout"
    | "table";
  text?: string;
  checked?: boolean;
  src?: string;
  alt?: string;
  width?: number;
  filename?: string;
  size?: number | null;
  lang?: string;
  calloutType?: string;
  calloutTypeRaw?: string;
  calloutFold?: string;
  title?: string;
  rows?: string[][];
  meta?: Record<string, string>;
}

export interface NoteContent {
  title: string;
  blocks: Block[];
}

export interface Note {
  title: string;
  folder: string | null;
  content: NoteContent;
  lastModified: number;
}

export type NoteData = Record<string, Note>;

export interface SearchIndexEntry {
  noteId: string;
  title: string;
  titleLower: string;
  plainText: string;
  plainTextLower: string;
  blockOffsets: { blockIndex: number; blockId: string; start: number; end: number }[];
  folder: string | null;
  lastModified: number;
}

export interface BacklinkEntry {
  sourceNoteId: string;
  sourceTitle: string;
  snippet: string;
}

export interface SlashCommand {
  id: string;
  label: string;
  desc: string;
  icon: string;
  type: string;
  calloutType?: string;
}

export interface SidebarNode {
  name: string;
  _path: string;
  notes: string[];
  children: SidebarNode[];
}
