import type { NoteData } from "../types/notes";

/**
 * What a `[[target]]` names. Obsidian writes three forms beyond the plain
 * name: `Note#Heading`, `Note#^block` and `Folder/Note` (optionally with a
 * `.md`). The part before the first `#` names the note, in the folder its path
 * gives when it gives one; the rest (`subpath`) is a heading or block this
 * editor cannot jump to and so ignores when opening. `name` is empty for a
 * link to a heading of the note it sits in (`[[#Intro]]`).
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
  const segments = path
    .replace(/\.md$/i, "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const name = segments.pop() ?? "";
  return { name, folder: segments.length ? segments.join("/") : null, subpath };
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
 * The id of the note a target names, or null. Titles match case-insensitively
 * as they always have. A folder in the target is explicit: only the note at
 * that path answers, never a namesake elsewhere, so a stale path opens nothing
 * (and says so) rather than silently opening the wrong note.
 */
export function resolveWikilink(target: string, noteData: NoteData): string | null {
  const key = wikilinkKey(parseWikilinkTarget(target));
  if (!key) return null;
  for (const [id, note] of Object.entries(noteData)) {
    if (noteLinkKeys(note).includes(key)) return id;
  }
  return null;
}

/**
 * Whether a click on an unresolved target may create the note it names: only
 * a plain name. A heading, block or folder path says more than a new empty
 * note at the root could honour, and the filename rules would turn the whole
 * target into `Beta#Intro.md` or `Work_Gamma.md`.
 */
export function wikilinkMayCreate({ name, folder, subpath }: WikilinkTarget): boolean {
  return name !== "" && folder === null && subpath === null;
}

/** What the toast says when an unresolved target is one the app will not create. */
export function unresolvedWikilinkMessage({ name, folder }: WikilinkTarget): string {
  if (!name) return "Links to a heading in this note can't be followed yet.";
  const where = folder ? ` in ${folder}` : "";
  return `No note named "${name}"${where}. Links to a heading, block or folder path don't create notes.`;
}
