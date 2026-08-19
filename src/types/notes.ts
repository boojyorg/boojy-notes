// The single type home for the note model and app-level data shapes.
// Vocabulary matches the app: `Note` is one note, `NoteData` is the map of
// notes keyed by id (what `useNoteData()` / `noteData[activeNote]` hold).

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
  /** Set to "\r\n" by the desktop loader for CRLF files so saves re-apply it. */
  eol?: string;
}

/** One note. Desktop notes come from disk via parseNoteFile; web notes from localStorage. */
export interface Note {
  id?: string;
  title: string;
  folder?: string | null;
  path?: string[] | null;
  content: NoteContent;
  /** Word count computed by the desktop loader. */
  words?: number;
  lastModified?: number;
  created?: string;
  updated?: string;
  _draft?: boolean;
  _syncVersion?: number;
}

/** The app's note store: note id → note. */
export type NoteData = Record<string, Note>;

/** A note in Recently Deleted, as returned by the desktop read-trash IPC. */
export interface TrashedNote {
  id: string;
  title: string;
  folder: string | null;
  deletedAt: number;
  content: NoteContent;
}

// ─── App-level data shapes (referenced from @ts-check'd .js via JSDoc) ─────

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
  wikilinkMatch: string;
}

export interface SlashCommand {
  id: string;
  label: string;
  desc: string;
  /** Lucide glyph name, resolved by SlashCommandIcon in Icons.jsx. */
  icon: string;
  type: string;
  calloutType?: string;
  /** Kept off the menu's opening screen; still found by typing. */
  advanced?: boolean;
}

export interface SidebarNode {
  name: string;
  _path: string;
  notes: string[];
  children: SidebarNode[];
}
