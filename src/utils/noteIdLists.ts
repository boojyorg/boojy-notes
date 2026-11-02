/**
 * A list of note ids kept by this window (localStorage), never written into
 * the vault: which notes are in the Markdown view, whose properties are
 * folded. Ids are unique across vaults and survive rename and move, so one
 * list serves every vault; the newest are kept, so ids of notes long gone
 * fall off the end.
 */
export const NOTE_ID_LIST_MAX = 200;

export function readNoteIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** `ids` with `noteId` in the list (newest last) or out of it. */
export function withNoteId(ids: string[], noteId: string, on: boolean): string[] {
  const rest = ids.filter((id) => id !== noteId);
  return on ? [...rest, noteId].slice(-NOTE_ID_LIST_MAX) : rest;
}

export function writeNoteIds(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage full or blocked: the list lasts this session */
  }
}
