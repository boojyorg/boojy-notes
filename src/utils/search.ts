// Pure search functions: no React dependencies.

import type { Block, Note, NoteData } from "../types/notes";
import { stripMarkdownFormatting } from "./inlineFormatting";
import { naturalCompare } from "./sidebarTree";

/**
 * What one block contributes to a note's searchable text: prose, a callout's
 * title and body, a table's cells, a code block's body. Search reads a code
 * block because a snippet is something you look for; the tag harvest reads
 * none of it (`utils/tags.ts`), which is a different question.
 */
function blockText(b: Block): string {
  if (b.type === "callout") return `${b.title || ""} ${b.text || ""}`.trim();
  if (b.type === "table") return (b.rows ?? []).map((r) => r.join(" ")).join(" ");
  return (b as { text?: string }).text || "";
}

/** Between two blocks in the plain text, so an excerpt that crosses one says so. */
export const BLOCK_JOIN = " · ";

export interface BlockOffset {
  blockIndex: number;
  blockId: string;
  start: number;
  end: number;
}

/**
 * Join all block text (stripping markdown) into one plain string.
 * Returns { plainText, blockOffsets } where blockOffsets maps
 * character positions back to block indices.
 */
export function buildPlainText(blocks: Block[] | null | undefined): {
  plainText: string;
  blockOffsets: BlockOffset[];
} {
  if (!blocks || blocks.length === 0) return { plainText: "", blockOffsets: [] };
  const blockOffsets: BlockOffset[] = [];
  let plainText = "";
  for (let i = 0; i < blocks.length; i++) {
    const text = stripMarkdownFormatting(blockText(blocks[i])).trim();
    // An empty block is a row on screen but nothing to search, and joining it
    // would put a run of separators into an excerpt.
    if (text && plainText) plainText += BLOCK_JOIN;
    const start = plainText.length;
    plainText += text;
    blockOffsets.push({ blockIndex: i, blockId: blocks[i].id, start, end: start + text.length });
  }
  return { plainText, blockOffsets };
}

/**
 * Text folded for matching: lower-cased, accents removed, with a map from
 * each folded index back to the index in the original, so a hit found in the
 * folded text is highlighted in the text as written. `cafe` finds `café`.
 * Every run of whitespace folds to one space, so a quoted phrase finds its
 * words across a soft break or a double space, however the query spaces them.
 */
export interface Folded {
  text: string;
  /** `map[i]` is the original index of folded unit `i`; `map[text.length]` is the original length. */
  map: number[];
}

export function foldText(s: string): Folded {
  const units: string[] = [];
  const map: number[] = [];
  let i = 0;
  let space = false;
  for (const ch of s) {
    const isSpace = /\s/u.test(ch);
    // The rest of a run maps to nothing: a range ending at the run still
    // maps to its first character, and one spanning it covers all of it.
    if (isSpace && space) {
      i += ch.length;
      continue;
    }
    space = isSpace;
    const folded = isSpace
      ? " "
      : ch
          .normalize("NFD")
          .replace(/\p{M}+/gu, "")
          .toLowerCase();
    for (let k = 0; k < folded.length; k++) {
      units.push(folded[k]);
      map.push(i);
    }
    i += ch.length;
  }
  map.push(s.length);
  return { text: units.join(""), map };
}

export interface IndexEntry {
  noteId: string;
  /** The note the entry was built from; a different object means a stale entry. */
  note: Note;
  title: string;
  titleFold: Folded;
  plainText: string;
  plainFold: Folded;
  blockOffsets: BlockOffset[];
  folder: string | null;
  lastModified: number;
}

export type SearchIndex = Map<string, IndexEntry>;

/** Build a search index from noteData. */
export function buildSearchIndex(noteData: NoteData): SearchIndex {
  const index: SearchIndex = new Map();
  for (const [noteId, note] of Object.entries(noteData)) {
    index.set(noteId, createIndexEntry(noteId, note));
  }
  return index;
}

function createIndexEntry(noteId: string, note: Note): IndexEntry {
  const title = note.title || note.content?.title || "";
  const { plainText, blockOffsets } = buildPlainText(note.content?.blocks || []);
  return {
    noteId,
    note,
    title,
    titleFold: foldText(title),
    plainText,
    plainFold: foldText(plainText),
    blockOffsets,
    folder: note.folder || null,
    lastModified: note.lastModified || 0,
  };
}

/** Update a single entry in the index. */
export function updateIndexEntry(index: SearchIndex, noteId: string, note: Note): void {
  index.set(noteId, createIndexEntry(noteId, note));
}

/** Delete a single entry from the index. */
export function removeIndexEntry(index: SearchIndex, noteId: string): void {
  index.delete(noteId);
}

export type Range = [number, number];

export interface Snippet {
  text: string;
  /** The matched words inside `text`, in order, never overlapping. */
  ranges: Range[];
}

export interface SearchResult {
  noteId: string;
  title: string;
  folder: string | null;
  score: number;
  /** `title` when every word of the query is in the title; then no excerpt is needed. */
  matchIn: "title" | "body";
  titleRanges: Range[];
  snippet: Snippet | null;
  matchBlockId: string | null;
  lastModified: number;
}

// One word's worth, by where it landed. Every word must land somewhere.
const TITLE_START = 4;
const TITLE_ANY = 3;
const TITLE_INITIALS = 2.5;
const BODY_START = 2;
const BODY_ANY = 1;

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;
const isWordChar = (c: string | undefined) => c !== undefined && WORD_CHAR.test(c);

/**
 * Where `word` is in the folded `text`: the first occurrence at the start of
 * a word if there is one, else the first occurrence anywhere.
 */
function findWord(text: string, word: string): { idx: number; start: boolean } | null {
  let idx = text.indexOf(word);
  if (idx === -1) return null;
  const first = idx;
  while (idx !== -1) {
    if (idx === 0 || !isWordChar(text[idx - 1])) return { idx, start: true };
    idx = text.indexOf(word, idx + 1);
  }
  return { idx: first, start: false };
}

/**
 * The one tolerance a title has: a query whose letters are the initials of
 * consecutive title words (`tn` for Todd's Note). Never scattered letters:
 * that is what lit `Today I de` for `todd` and is gone. Returns the folded
 * ranges of those initials.
 */
function initialsMatch(titleFold: string, word: string): Range[] | null {
  if (word.length < 2 || !/^\p{L}+$/u.test(word)) return null;
  const starts: number[] = [];
  const joins = (c: string | undefined) => isWordChar(c) || c === "'" || c === "\u2019";
  for (let i = 0; i < titleFold.length; i++) {
    if (isWordChar(titleFold[i]) && !joins(titleFold[i - 1])) starts.push(i);
  }
  const initials = starts.map((i) => titleFold[i]).join("");
  const k = initials.indexOf(word);
  if (k === -1) return null;
  return starts.slice(k, k + word.length).map((i) => [i, i + 1] as Range);
}

const mapRange = (f: Folded, r: Range): Range => [f.map[r[0]], f.map[r[1]]];

/** Every occurrence of every word inside `[from, to)` of the folded text. */
function occurrencesWithin(text: string, words: string[], from: number, to: number): Range[] {
  const out: Range[] = [];
  for (const w of words) {
    let idx = text.indexOf(w, from);
    while (idx !== -1 && idx + w.length <= to) {
      out.push([idx, idx + w.length]);
      idx = text.indexOf(w, idx + 1);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

const SNIPPET_PAD = 40;

/**
 * One line of context around the first matched word in the body, with every
 * matched word inside it marked. Cut at word boundaries where it can be.
 */
export function extractSnippet(entry: IndexEntry, words: string[], hit: Range): Snippet {
  const f = entry.plainFold;
  const text = f.text;
  let start = Math.max(0, hit[0] - SNIPPET_PAD);
  let end = Math.min(text.length, hit[1] + SNIPPET_PAD);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < hit[0]) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > hit[1]) end = space;
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const oStart = f.map[start];
  const oEnd = f.map[end];
  const ranges = occurrencesWithin(text, words, start, end).map((r) => {
    const [a, b] = mapRange(f, r);
    return [a - oStart + prefix.length, b - oStart + prefix.length] as Range;
  });
  return { text: prefix + entry.plainText.slice(oStart, oEnd) + suffix, ranges };
}

export interface SearchOptions {
  limit?: number;
  /** Only these notes are searched; with an empty query they are all listed, newest first. */
  noteIds?: Set<string> | null;
  /** Only notes in this folder or below it; with an empty query, listed newest first. */
  folder?: string | null;
}

/** Whether a note in `noteFolder` is inside `folder`, subfolders included. */
export const inFolder = (noteFolder: string | null, folder: string) =>
  noteFolder === folder || !!noteFolder?.startsWith(`${folder}/`);

/**
 * The query's terms, folded: words split on spaces, and a quoted phrase as
 * one term with its spaces in it (`"exam notes"`, as Obsidian writes it). An
 * unclosed quote runs to the end, so the results hold while the phrase is
 * still being typed. Empty quotes are nothing.
 */
export function queryTerms(query: string): string[] {
  const terms: string[] = [];
  const parts = (query || "").split('"');
  parts.forEach((part, i) => {
    const folded = foldText(part).text;
    if (i % 2 === 1) {
      const phrase = folded.trim().replace(/ +/g, " ");
      if (phrase) terms.push(phrase);
    } else terms.push(...folded.split(" ").filter(Boolean));
  });
  return terms;
}

/**
 * Main search function. The query is terms (`queryTerms`); every term must be
 * somewhere in the title or body, in any order, matched case- and accent-insensitively. A
 * word at the start of a title word ranks highest, then anywhere in the
 * title, then the title's initials, then at the start of a body word, then
 * anywhere in the body; ties break by last modified. No fuzzy matching.
 */
export function searchNotes(
  query: string,
  index: SearchIndex,
  options: SearchOptions | number = {},
): { results: SearchResult[]; totalCount: number } {
  const {
    limit = 50,
    noteIds = null,
    folder = null,
  } = typeof options === "number" ? { limit: options } : options;
  const words = queryTerms(query);
  let entries = noteIds
    ? [...noteIds].map((id) => index.get(id)).filter((e): e is IndexEntry => !!e)
    : [...index.values()];
  if (folder) entries = entries.filter((e) => inFolder(e.folder, folder));

  if (words.length === 0) {
    if (!noteIds && !folder) return { results: [], totalCount: 0 };
    const listed = entries
      .sort((a, b) => b.lastModified - a.lastModified)
      .map((e) => plainResult(e, 0));
    return { results: listed.slice(0, limit), totalCount: listed.length };
  }

  const scored: Array<{
    entry: IndexEntry;
    score: number;
    titleRanges: Range[];
    bodyHit: Range | null;
  }> = [];
  for (const entry of entries) {
    let score = 0;
    let allInTitle = true;
    const titleRanges: Range[] = [];
    let bodyHit: Range | null = null;
    let ok = true;
    for (const w of words) {
      let best = 0;
      const t = findWord(entry.titleFold.text, w);
      if (t) {
        best = t.start ? TITLE_START : TITLE_ANY;
        titleRanges.push(mapRange(entry.titleFold, [t.idx, t.idx + w.length]));
      } else {
        const initials = initialsMatch(entry.titleFold.text, w);
        if (initials) {
          best = TITLE_INITIALS;
          for (const r of initials) titleRanges.push(mapRange(entry.titleFold, r));
        }
      }
      const b = findWord(entry.plainFold.text, w);
      if (b) {
        const s = b.start ? BODY_START : BODY_ANY;
        if (s > best) best = s;
        const hit: Range = [b.idx, b.idx + w.length];
        if (!bodyHit || hit[0] < bodyHit[0]) bodyHit = hit;
      }
      if (best === 0) {
        ok = false;
        break;
      }
      if (best < TITLE_INITIALS) allInTitle = false;
      score += best;
    }
    if (!ok) continue;
    scored.push({ entry, score, titleRanges, bodyHit: allInTitle ? null : bodyHit });
  }

  scored.sort((a, b) => b.score - a.score || b.entry.lastModified - a.entry.lastModified);
  const results = scored.slice(0, limit).map(({ entry, score, titleRanges, bodyHit }) => {
    const r = plainResult(entry, score);
    r.titleRanges = titleRanges.sort((a, b) => a[0] - b[0]);
    if (bodyHit) {
      r.matchIn = "body";
      r.snippet = extractSnippet(entry, words, bodyHit);
      r.matchBlockId = findMatchBlock(entry.blockOffsets, entry.plainFold.map[bodyHit[0]]);
    }
    return r;
  });
  return { results, totalCount: scored.length };
}

function plainResult(entry: IndexEntry, score: number): SearchResult {
  return {
    noteId: entry.noteId,
    title: entry.title,
    folder: entry.folder,
    score,
    matchIn: "title",
    titleRanges: [],
    snippet: null,
    matchBlockId: null,
    lastModified: entry.lastModified,
  };
}

/** Find the blockId containing the match position in plain text. */
export function findMatchBlock(
  blockOffsets: BlockOffset[] | null | undefined,
  matchStartInPlainText: number,
): string | null {
  if (!blockOffsets || blockOffsets.length === 0) return null;
  for (const bo of blockOffsets) {
    if (matchStartInPlainText >= bo.start && matchStartInPlainText < bo.end) return bo.blockId;
  }
  // In the join between two blocks: the next one.
  for (let i = 0; i < blockOffsets.length - 1; i++) {
    if (
      matchStartInPlainText >= blockOffsets[i].end &&
      matchStartInPlainText < blockOffsets[i + 1].start
    )
      return blockOffsets[i + 1].blockId;
  }
  return blockOffsets[0]?.blockId || null;
}

export interface FolderHit {
  /** The folder's vault-relative path. */
  path: string;
  /** Its own name, the last segment, which is what is matched. */
  name: string;
  /** The folder it sits in, or null at the root. */
  parent: string | null;
  score: number;
  nameRanges: Range[];
}

/** At most this many folders in a result list, so notes are never pushed off it. */
export const FOLDER_HITS = 2;

/**
 * Folders whose own name holds every term of the query, scored as a note's
 * title is: `univ` finds University, never Archive inside it. Best first,
 * then the shallower, then by name.
 */
export function searchFolders(query: string, folders: string[], limit = FOLDER_HITS): FolderHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const hits: FolderHit[] = [];
  for (const path of folders) {
    const slash = path.lastIndexOf("/");
    const name = path.slice(slash + 1);
    const fold = foldText(name);
    let score = 0;
    const nameRanges: Range[] = [];
    for (const t of terms) {
      const f = findWord(fold.text, t);
      if (!f) {
        score = 0;
        break;
      }
      score += f.start ? TITLE_START : TITLE_ANY;
      nameRanges.push(mapRange(fold, [f.idx, f.idx + t.length]));
    }
    if (score === 0) continue;
    nameRanges.sort((a, b) => a[0] - b[0]);
    hits.push({
      path,
      name,
      parent: slash === -1 ? null : path.slice(0, slash),
      score,
      nameRanges,
    });
  }
  const depth = (p: string) => p.split("/").length;
  hits.sort(
    (a, b) => b.score - a.score || depth(a.path) - depth(b.path) || naturalCompare(a.path, b.path),
  );
  return hits.slice(0, limit);
}

export type ResultRow =
  | { kind: "note"; result: SearchResult }
  | { kind: "folder"; folder: FolderHit };

/**
 * The one order of a result list with folders in it. Folders go first,
 * except under a note whose title matches at least as well: that note stays
 * first, so Enter still opens `Boojy` when a folder is also called Boojy.
 */
export function orderResults(notes: SearchResult[], folders: FolderHit[]): ResultRow[] {
  const noteRows = notes.map((result) => ({ kind: "note", result }) as const);
  const folderRows = folders.map((folder) => ({ kind: "folder", folder }) as const);
  const top = notes[0];
  if (top && top.matchIn === "title" && folders.length && top.score >= folders[0].score) {
    return [noteRows[0], ...folderRows, ...noteRows.slice(1)];
  }
  return [...folderRows, ...noteRows];
}
