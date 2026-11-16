import type { NoteData } from "../types/notes";
import { vaultNotes } from "./vaultNotes";

/**
 * What a `[[target]]` names. Obsidian writes three forms beyond the plain
 * name: `Note#Heading`, `Note#^block` and `Folder/Note` (optionally with a
 * `.md`). The part before the first `#` names the note, in the folder its path
 * gives when it gives one; the rest (`subpath`) is a heading, followed on a
 * click (`headingTarget.ts`), or a block, which only opens the note. `name` is
 * empty for a link to a heading of the note it sits in (`[[#Intro]]`).
 */
export interface WikilinkTarget {
  /** The note's name, the last path segment, `.md` stripped, trimmed. */
  name: string;
  /** The vault-relative folder the path names, `/`-separated, or null for none. */
  folder: string | null;
  /** The heading or block after `#`, or null when the target has none. */
  subpath: string | null;
}

export function parseWikilinkTarget(target: string): WikilinkTarget {
  const hash = target.indexOf("#");
  const path = (hash === -1 ? target : target.slice(0, hash)).trim();
  const subpath = hash === -1 ? null : target.slice(hash + 1).trim();
  return { ...pathTarget(path), subpath };
}

/**
 * A vault path as a target, nothing in it read as a heading: a Markdown
 * link's decoded path may hold a `#` of the name's own (`C# notes.md`).
 */
export function pathTarget(path: string): WikilinkTarget {
  const segments = path
    .replace(/\.md$/i, "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const name = segments.pop() ?? "";
  return { name, folder: segments.length ? segments.join("/") : null, subpath: null };
}

/**
 * The keys a note answers to, lowercased: its title, and `folder/title` when
 * it sits in a folder. The renderer's title set holds these, so a target is
 * judged broken by the same reading the click resolves by.
 */
export function noteLinkKeys(note: { title?: string; folder?: string | null }): string[] {
  const title = (note.title || "").trim().toLowerCase();
  if (!title) return [];
  return note.folder ? [title, `${note.folder.toLowerCase()}/${title}`] : [title];
}

/** The key a target's note is looked up by, or null for a target that names no note. */
export function wikilinkKey({ name, folder }: WikilinkTarget): string | null {
  if (!name) return null;
  const key = name.toLowerCase();
  return folder ? `${folder.toLowerCase()}/${key}` : key;
}

/**
 * What an unpiped link shows, as Obsidian's reading view does: a target with
 * a `#` reads `Note > Heading` (`Note > H1 > H2`), one in the same note the
 * heading alone; any other target is itself, a file's page (`#page=4`)
 * among them. Pure text: the renderer passes its HTML-escaped target and
 * `" &gt; "`.
 */
export function wikilinkLabel(target: string, separator = " > "): string {
  const hash = target.indexOf("#");
  if (hash === -1 || /^\s*page=/.test(target.slice(hash + 1))) return target;
  const parts = [target.slice(0, hash), ...target.slice(hash + 1).split("#")]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.join(separator) : target;
}

/** What the toast says when a link's heading is not in its note (`noteTitle` null: the open note). */
export function missingHeadingMessage(segments: string[], noteTitle: string | null): string {
  const heading = segments[segments.length - 1].trim();
  return noteTitle == null
    ? `No heading “${heading}” in this note.`
    : `No heading “${heading}” in ${noteTitle}.`;
}

/** What the toast says when a link's block ID is not in its note (`noteTitle` null: the open note). */
export function missingBlockMessage(id: string, noteTitle: string | null): string {
  return noteTitle == null
    ? `No block “^${id}” in this note.`
    : `No block “^${id}” in ${noteTitle}.`;
}

/** What the toast says when an unresolved target is one the app will not create. */
export function unresolvedWikilinkMessage({ name, folder }: WikilinkTarget): string {
  const where = folder ? ` in ${folder}` : "";
  return `No note named "${name}"${where}. Links to a heading, block or folder path don't create notes.`;
}

/**
 * The one note at exactly this path: the name in the folder the path gives,
 * the vault's root when it gives none. A wikilink's bare name is found
 * anywhere (`wikilinkStatus`); a path names one place.
 */
export function noteAtPath({ name, folder }: WikilinkTarget, noteData: NoteData): string | null {
  const want = `${folder ?? ""}/${name}`.toLowerCase();
  const ids = Object.entries(vaultNotes(noteData))
    .filter(([, n]) => !n._draft && `${n.folder ?? ""}/${n.title ?? ""}`.toLowerCase() === want)
    .map(([id]) => id);
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Of the notes sharing a name, the one a bare `[[Name]]` means: the one
 * nearest the vault's root, as Obsidian's shortest path. Two at the same
 * depth is a true tie and names neither (null): the link is drawn dashed and
 * a click asks. The one rule for the click, the renderer's title set and the
 * links a rename rewrites.
 */
export function nearestRoot(
  ids: readonly string[] | undefined,
  notes: Record<string, { folder?: string | null } | undefined>,
): string | null {
  if (!ids?.length) return null;
  if (ids.length === 1) return ids[0];
  const depth = (id: string) => notes[id]?.folder?.split("/").length ?? 0;
  const least = Math.min(...ids.map(depth));
  const nearest = ids.filter((id) => depth(id) === least);
  return nearest.length === 1 ? nearest[0] : null;
}

/**
 * Characters a wikilink's own syntax is made of. A name holding one cannot
 * be written inside `[[…]]` (`[[C# notes]]` is the note `C` at a heading):
 * a new name never holds one (`write-note`), and a name the disk already
 * holds is linked by a Markdown link instead (`pathLinkTo`).
 */
export const BREAKS_WIKILINK = /[#^[\]|]/;

// ── The unified link picker ─────────────────────────────────────────────

/** Every note a target could name: one for a clean link, several for a namesake, none for a missing one. */
export function wikilinkCandidates(target: string, noteData: NoteData): string[] {
  return candidatesOf(parseWikilinkTarget(target), noteData);
}

function candidatesOf(parsed: WikilinkTarget, noteData: NoteData): string[] {
  const key = wikilinkKey(parsed);
  if (!key) return [];
  const ids: string[] = [];
  for (const [id, note] of Object.entries(vaultNotes(noteData))) {
    if (note._draft) continue;
    if (noteLinkKeys(note).includes(key)) ids.push(id);
  }
  return ids;
}

/**
 * The shortest target that names this note and no other: its title, or
 * `Folder/Title` when another note shares the title (Obsidian's rule). A
 * note at the root keeps its title alone: nothing is nearer the root, so the
 * bare name always means it (`nearestRoot`). The picker writes this, so a
 * plain `[[Goals]]` is only ever written where no later note can take it.
 */
export function linkTargetFor(id: string, noteData: NoteData): string {
  const note = noteData[id];
  if (!note) return "";
  const title = (note.title || "").trim();
  const key = title.toLowerCase();
  const namesakes = Object.entries(vaultNotes(noteData)).filter(
    ([other, n]) => other !== id && !n._draft && (n.title || "").trim().toLowerCase() === key,
  );
  return namesakes.length > 0 && note.folder ? `${note.folder}/${title}` : title;
}

/** The one note a parsed target names: at its path, or of its bare name, the nearest the root. */
export function noteNamed(parsed: WikilinkTarget, noteData: NoteData): string | null {
  const ids = candidatesOf(parsed, noteData);
  return parsed.folder ? (ids.length === 1 ? ids[0] : null) : nearestRoot(ids, noteData);
}

export type WikilinkStatus =
  | { kind: "note"; id: string; title: string; folder: string | null }
  | { kind: "ambiguous"; ids: string[]; name: string }
  | { kind: "missing"; name: string; folder: string | null };

/** What a target names now: the note, several notes, or nothing. */
export function wikilinkStatus(target: string, noteData: NoteData): WikilinkStatus {
  const parsed = parseWikilinkTarget(target);
  const ids = candidatesOf(parsed, noteData);
  const id = noteNamed(parsed, noteData);
  if (id) {
    const n = noteData[id];
    return { kind: "note", id, title: n.title || "Untitled", folder: n.folder || null };
  }
  if (ids.length > 1) return { kind: "ambiguous", ids, name: parsed.name };
  // Missing: the name the reader would search by.
  return { kind: "missing", name: parsed.name, folder: parsed.folder };
}
