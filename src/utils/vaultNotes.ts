import type { NoteData } from "../types/notes";

const cache = new WeakMap<NoteData, NoteData>();

/**
 * What adding a picture or a file to a note opened from outside every
 * location says: it would be saved into the open location, beside nothing
 * the note can reach, so nothing is saved.
 */
export const OUTSIDE_ADDS_NO_FILES =
  "Pictures and files can't be added to a note outside your storage locations yet.";

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
