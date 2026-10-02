const rand = (): string => Math.random().toString(36).slice(2, 7);
export const genBlockId = (): string => `blk-${Date.now()}-${rand()}`;
export const genNoteId = (): string => `note-${Date.now()}-${rand()}`;

export const STORAGE_KEY = "boojy-notes-v1";

export const loadFromStorage = (): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    return null;
  }
};
