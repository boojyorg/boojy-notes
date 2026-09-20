import type { NoteData } from "../types/notes";

/**
 * The notes opened most recently, for Search's empty state. A separate list,
 * never a timestamp on the note: opening is not editing, so nothing here
 * moves a note in "Most recent" (the sort's rule). Kept per vault in
 * localStorage so it survives a restart and a vault switch shows that
 * vault's own list. Ids survive rename and move; a note that is gone, a
 * draft, or the note that is open are left out when the list is read.
 */
export const RECENT_KEY = "boojy-recent-notes";
export const RECENT_MAX = 30;
/** How many the palette shows at most; fewer when the window is short. */
export const RECENT_SHOWN = 8;

type Store = Record<string, string[]>;

function readStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "null");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function readRecents(vaultKey: string): string[] {
  const list = readStore()[vaultKey];
  return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
}

/** Put `noteId` at the head of the vault's list; returns the list written. */
export function recordRecent(vaultKey: string, noteId: string): string[] {
  const store = readStore();
  const next = [noteId, ...readRecents(vaultKey).filter((id) => id !== noteId)].slice(
    0,
    RECENT_MAX,
  );
  store[vaultKey] = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(store));
  } catch {}
  return next;
}

/** The rows to show: existing, non-draft notes other than the open one, newest first. */
export function recentRows(
  ids: string[],
  noteData: NoteData,
  currentId: string | null,
  max = RECENT_SHOWN,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id === currentId) continue;
    const note = noteData[id];
    if (!note || note._draft) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
