import type { NoteData } from "../types/notes";

const cache = new WeakMap<NoteData, NoteData>();

/**
 * The open storage location's notes: every note but one opened from outside
 * every location (`outside`, electron/outsideNotes.ts). Every reader that
 * lists, searches, tags or links notes reads these and never the whole store,
 * so a file opened from Downloads is in no tree, result, tag or link.
 * The same store answers with the same object, so a memo keyed on it holds.
 */
export function vaultNotes(noteData: NoteData): NoteData {
  let listed = cache.get(noteData);
  if (listed) return listed;
  listed = Object.values(noteData).some((n) => n?.outside)
    ? Object.fromEntries(Object.entries(noteData).filter(([, n]) => !n?.outside))
    : noteData;
  cache.set(noteData, listed);
  return listed;
}
