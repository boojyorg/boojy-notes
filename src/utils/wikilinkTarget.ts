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
 * (and says so) rather than silently opening the wrong note. **A name two
 * notes share resolves to neither** (2026-09-20, Tyr's decision): it used to
 * open whichever loaded first; the click now asks (`wikilinkStatus`).
 */
export function resolveWikilink(target: string, noteData: NoteData): string | null {
  const ids = wikilinkCandidates(target, noteData);
  return ids.length === 1 ? ids[0] : null;
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

// ── The unified link picker (2026-09-20) ────────────────────────────────

/** Every note a target could name: one for a clean link, several for a namesake, none for a missing one. */
export function wikilinkCandidates(target: string, noteData: NoteData): string[] {
  const key = wikilinkKey(parseWikilinkTarget(target));
  if (!key) return [];
  const ids: string[] = [];
  for (const [id, note] of Object.entries(noteData)) {
    if (note._draft) continue;
    if (noteLinkKeys(note).includes(key)) ids.push(id);
  }
  return ids;
}

/**
 * The shortest target that names this note and no other: its title, or
 * `Folder/Title` when another note shares the title (Obsidian's rule). The
 * picker writes this, so a plain `[[Goals]]` is only ever written when it is
 * unambiguous.
 */
export function linkTargetFor(id: string, noteData: NoteData): string {
  const note = noteData[id];
  if (!note) return "";
  const title = (note.title || "").trim();
  const key = title.toLowerCase();
  const namesakes = Object.entries(noteData).filter(
    ([other, n]) => other !== id && !n._draft && (n.title || "").trim().toLowerCase() === key,
  );
  return namesakes.length > 0 && note.folder ? `${note.folder}/${title}` : title;
}

export type WikilinkStatus =
  | { kind: "note"; id: string; title: string; folder: string | null }
  | { kind: "ambiguous"; ids: string[]; name: string }
  | { kind: "missing"; name: string; folder: string | null };

/** What a target names now: the note, several notes, or nothing. */
export function wikilinkStatus(target: string, noteData: NoteData): WikilinkStatus {
  const parsed = parseWikilinkTarget(target);
  const ids = wikilinkCandidates(target, noteData);
  if (ids.length === 1) {
    const n = noteData[ids[0]];
    return { kind: "note", id: ids[0], title: n.title || "Untitled", folder: n.folder || null };
  }
  if (ids.length > 1) return { kind: "ambiguous", ids, name: parsed.name };
  // Missing: the name the reader would search by.
  return { kind: "missing", name: parsed.name, folder: parsed.folder };
}
