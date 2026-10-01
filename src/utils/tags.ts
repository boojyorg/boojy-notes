import type { Block, NoteData } from "../types/notes";
import { LINK_DEST } from "./linkDestination";

/**
 * The one tag grammar. `#` at the start of the text or after whitespace or
 * `(`, then a letter, then letters, digits, marks, `_`, `/` or `-`. The
 * renderer (`inlineMarkdownToHtml`), the `#…` completion under the caret,
 * the tag rows in Search and the tag filter all read this, so a `#` the
 * editor never draws as a tag can never be offered as one: before 2026-09-20
 * the harvest had no left boundary and listed `#b` from `a#b` and `#top` from
 * a URL fragment. Unicode letters are tags too (`#café`).
 */
export const TAG_BODY = "\\p{L}[\\p{L}\\p{M}\\p{N}_/-]*";
export const TAG_RE = new RegExp(`(^|[\\s(])#(${TAG_BODY})`, "gu");
/** The `#…` token the caret is at the end of, for the completion menu. */
export const TAG_TAIL_RE = new RegExp(`(^|[\\s(])#(${TAG_BODY})$`, "u");
/** One character that may continue a tag; anything else typed at its end is prose. */
export const TAG_CHAR_RE = /^[\p{L}\p{M}\p{N}_/-]$/u;

/**
 * A tag's identity: case-insensitive, accent-sensitive. `#Café` and `#café`
 * are one tag, `#cafe` is another. NFC so the two encodings of an accented
 * letter meet. Search folds accents when *matching* text; identity does not.
 */
export const tagKey = (tag: string) => tag.normalize("NFC").toLowerCase();

/**
 * Where tags may come from: ordinary prose. Code blocks, frontmatter and
 * anything that is not text (an image, a file, a divider) are not tag
 * sources, and inside prose an inline code span, a bare URL and a link's
 * address are dropped before the grammar runs, so `color: #fff` in a fence,
 * `` `#include` `` and `example.com/page#top` never become tags. Search still
 * reads all of that as text; that is a separate question.
 */
export function tagSourceText(block: Block): string[] {
  switch (block.type) {
    case "code":
    case "frontmatter":
    case "image":
    case "file":
    case "embed":
    case "spacer":
      return [];
    case "table":
      return (block.rows ?? []).flat();
    case "callout":
      return [block.title ?? "", block.text ?? ""];
    default:
      return [(block as { text?: string }).text ?? ""];
  }
}

const NOT_PROSE_RE = new RegExp(
  String.raw`\`[^\`]*\`|https?:\/\/\S+|www\.\S+|\]\(${LINK_DEST}\)|\[\[[^\]]*\]\]`,
  "g",
);

/** Every tag in one piece of prose, as written. */
export function tagsInText(text: string): string[] {
  if (!text?.includes("#")) return [];
  const prose = text.replace(NOT_PROSE_RE, " ");
  const out: string[] = [];
  for (const m of prose.matchAll(TAG_RE)) out.push(m[2]);
  return out;
}

export interface TagEntry {
  /** The spelling seen first; the rows show it. */
  tag: string;
  noteIds: Set<string>;
}

/**
 * Every tag in the vault, keyed by `tagKey`, with the notes that carry it.
 */
export function extractAllTags(noteData: NoteData | null | undefined): Map<string, TagEntry> {
  const tags = new Map<string, TagEntry>();
  if (!noteData) return tags;
  for (const [noteId, note] of Object.entries(noteData)) {
    const blocks = note?.content?.blocks;
    if (!blocks) continue;
    for (const block of blocks) {
      for (const text of tagSourceText(block)) {
        for (const tag of tagsInText(text)) {
          const key = tagKey(tag);
          let entry = tags.get(key);
          if (!entry) {
            entry = { tag, noteIds: new Set() };
            tags.set(key, entry);
          }
          entry.noteIds.add(noteId);
        }
      }
    }
  }
  return tags;
}

/**
 * The tags as Search reads them, nested as Obsidian reads them: a note
 * tagged `#uni/lectures` also carries `#uni`, which is listed even when no
 * note writes it alone. A parent ends before a `/` and never on an empty
 * level. Spelt as written, else as the first child seen writes it. Returns a new map; the
 * written tags (the `#…` completion's list) are untouched.
 */
export function nestTags(tags: Map<string, TagEntry>): Map<string, TagEntry> {
  const nested = new Map<string, TagEntry>();
  const add = (key: string, tag: string, noteIds: Set<string>) => {
    let entry = nested.get(key);
    if (!entry) {
      entry = { tag, noteIds: new Set() };
      nested.set(key, entry);
    }
    for (const id of noteIds) entry.noteIds.add(id);
  };
  // The written tags first, so a tag written alone keeps its own spelling.
  for (const [key, { tag, noteIds }] of tags) add(key, tag, noteIds);
  for (const { tag, noteIds } of tags.values()) {
    for (let i = tag.indexOf("/"); i !== -1; i = tag.indexOf("/", i + 1)) {
      if (tag[i - 1] !== "/") add(tagKey(tag.slice(0, i)), tag.slice(0, i), noteIds);
    }
  }
  return nested;
}

/** The tag list as the rows show it: most used first, then alphabetical. */
export function tagRows(tags: Map<string, TagEntry>): Array<{ tag: string; count: number }> {
  return [...tags.values()]
    .map((t) => ({ tag: t.tag, count: t.noteIds.size }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
