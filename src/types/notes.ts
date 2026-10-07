// The single type home for the note model and app-level data shapes.
// Vocabulary matches the app: `Note` is one note, `NoteData` is the map of
// notes keyed by id (what `useNoteData()` / `noteData[activeNote]` hold).

export type BlockType =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
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
  /** Written with no blank line above where the app would write one (markdown.js). */
  tightAbove?: true;
  /** Written with one blank line above where the app would write none: a loose list item. */
  looseAbove?: true;
  indent?: number;
  /** Source spelling retained until a structural list edit makes it obsolete. */
  indentStr?: string;
  num?: number;
  numRaw?: string;
  marker?: string;
  /** A list item's tab after its marker, where the app writes a space. */
  gap?: string;
  /** Whitespace after a list item's text or an embed, kept as written. */
  trail?: string;
  /** Whitespace before a picture or embed (indented under a list item), kept as written. */
  lead?: string;
  /** A quote's or callout body's marker per line (`>`, `>\t`), where one is not `> `. */
  quoteMarks?: string[];
}

// ─── Discriminated block variants ─────────────────────────────────
interface TextBlock extends BlockBase {
  type: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "bullet" | "numbered" | "blockquote";
  /** Imported ATX spacing and optional closing markers, separate from editable text. */
  headingSource?: { indent: string; gap: string; suffix: string };
}

interface CheckboxBlock extends BlockBase {
  type: "checkbox";
  checked?: boolean;
  /** An imported uppercase `[X]`, kept until the box is toggled. */
  checkMark?: "X";
}

interface CodeBlock extends BlockBase {
  type: "code";
  lang?: string;
  /** Authored boundaries when they differ from the app's generated fence. */
  fenceSource?: { open: string; close: string | null; empty?: boolean };
}

interface CalloutBlock extends BlockBase {
  type: "callout";
  calloutType?: string;
  calloutTypeRaw?: string;
  calloutFold?: string;
  title?: string;
  /** The marker line as written, reused while type, fold and title (its `key`) are unchanged. */
  headerSource?: { line: string; key: string };
}

interface ImageBlock extends BlockBase {
  type: "image";
  src?: string;
  alt?: string;
  width?: number;
  /** What follows the file's name in the link (`#interface`), kept as written. */
  subpath?: string;
}

interface FileBlock extends BlockBase {
  type: "file";
  filename?: string;
  size?: number | null;
  src?: string;
  /** Obsidian's size for an embedded file (`![[clip.mp4|300]]`), kept as written. */
  widthPx?: number;
}

interface EmbedBlock extends BlockBase {
  type: "embed";
  target?: string;
  heading?: string | null;
}

interface TableBlock extends BlockBase {
  type: "table";
  /** Ragged: each row holds exactly the cells its Markdown line holds. */
  rows?: string[][];
  alignments?: string[];
  /** The lines as read; a row whose cells are unchanged is written back as its line. */
  tableSource?: { header: string; separator: string; rows: string[] };
}

interface SpacerBlock extends BlockBase {
  type: "spacer";
  /** The divider line as written, when it is not exactly `---`. */
  dividerSource?: string;
}

interface FrontmatterBlock extends BlockBase {
  type: "frontmatter";
  /** The closer as written when it is not `---`; `empty` for `---` straight over `---`. */
  frontmatterSource?: { close?: string; empty?: true };
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
  content: NoteContent;
  lastModified?: number;
  _draft?: boolean;
  /** Its text is not on this Mac (a sync client removed the download); opening downloads it. */
  offloaded?: true;
  /**
   * Its file is there but cannot be edited as text: not UTF-8 (`encoding`),
   * over the size the app opens (`too-large`), or it failed to read (`read`).
   * Listed with no blocks; never written, only moved.
   */
  unreadable?: "encoding" | "too-large" | "read";
}

/** The app's note store: note id → note. */
export type NoteData = Record<string, Note>;

// ─── App-level data shapes (referenced from @ts-check'd .js via JSDoc) ─────

export interface SlashCommand {
  id: string;
  label: string;
  /** The typed Markdown shortcut that makes this block; empty when there is none. */
  hint: string;
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
