import type { Block, Note, NoteData } from "../types/notes";
import { stripMarkdownFormatting } from "./inlineFormatting";
import { recencyOf } from "./noteSort";
import { editedLabel } from "./versionTime";

/** How many cards Home shows at most: a 2 × 2 grid. */
export const RECENT_CARDS = 4;
/** How much of a note a card previews. */
const PREVIEW_LINES = 4;
const LINE_MAX = 80;

/** The blocks a preview passes over: they are not the note's words. */
const SKIPPED = new Set([
  "frontmatter",
  "spacer",
  "image",
  "file",
  "embed",
  "math",
  // Source, not prose: a diagram's code would be shown raw, a footnote out of its place.
  "code",
  "footnote",
]);

/**
 * What a card never shows of a line: a `%%` comment (kept out of sight in
 * the note too, and an unclosed one runs to the line's end), a footnote's
 * marker, a formula's source, and a table cell's `<br>`.
 */
const unsaid = (text: string) =>
  text
    .replace(/%%[\s\S]*?(%%|$)/g, " ")
    .replace(/\^\[[^\]]*\]|\[\^[^\]]+\]/g, "")
    .replace(/\$\$?[^$\n]+\$\$?/g, " ")
    .replace(/<br\s*\/?>/gi, " ");

/** `text` cut to `max` characters with an ellipsis, never through the middle of one (an emoji is two units). */
const cut = (text: string, max: number) => {
  const chars = Array.from(text);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : text;
};

/**
 * The notes edited most recently, newest first, for Home's cards. "Recent"
 * is the sort's own clock (`recencyOf`: an edit in the app, or the file's
 * modified time), never when a note was opened, so a card and Most recent
 * agree and an edit made on another device shows here once it syncs. A draft,
 * a note that cannot be read, one from outside the vault, and one the app
 * knows no time for are left out.
 */
export function recentlyEdited(
  noteData: NoteData,
  editedAt: Record<string, number>,
  max = RECENT_CARDS,
): string[] {
  return Object.keys(noteData)
    .filter((id) => {
      const note = noteData[id];
      return !note._draft && !note.unreadable && !note.outside && !note.offloaded;
    })
    .map((id) => ({ id, at: recencyOf(id, noteData, editedAt) }))
    .filter((n) => n.at > 0)
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1))
    .slice(0, max)
    .map((n) => n.id);
}

const lineOf = (b: Block): string => {
  if (SKIPPED.has(b.type)) return "";
  if (b.type === "table") return (b.rows?.[0] ?? []).join(" ");
  if (b.type === "callout") return `${b.title || ""} ${b.text || ""}`;
  return (b as { text?: string }).text || "";
};

/**
 * A note's first lines as plain words, one per block that has any: what a
 * card shows under the name. Plain, not drawn as Markdown: a card is a way
 * to its note, and nothing in it is pressed on its own.
 */
export function cardPreview(note: Note | undefined, lines = PREVIEW_LINES): string[] {
  const out: string[] = [];
  for (const block of note?.content?.blocks ?? []) {
    const text = stripMarkdownFormatting(unsaid(lineOf(block)))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    out.push(cut(text, LINE_MAX));
    if (out.length >= lines) break;
  }
  return out;
}

/** When a card's note was edited, without the menu's "Edited": `12 min ago`, `17:58`, `Tue at 10:12`. */
export function cardTime(at: number, now: number, hour12?: boolean, locale?: string): string {
  const said = editedLabel(at, now, hour12, locale).replace(/^Edited (at )?/, "");
  return said.charAt(0).toUpperCase() + said.slice(1);
}
