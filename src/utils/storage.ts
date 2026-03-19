let _blockId = 0;
export const genBlockId = (): string => `blk-${Date.now()}-${++_blockId}`;
export const setBlockIdCounter = (val: number): void => {
  _blockId = val;
};

let _noteId = 0;
export const genNoteId = (): string => `note-${Date.now()}-${++_noteId}`;

export const STORAGE_KEY = "boojy-notes-v1";
let _cachedStorage: Record<string, unknown> | null | undefined;
export const loadFromStorage = (): Record<string, unknown> | null => {
  if (_cachedStorage !== undefined) return _cachedStorage;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cachedStorage = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    _cachedStorage = null;
  }
  // Auto-clear cache after a tick so subsequent calls re-read from localStorage
  setTimeout(() => { _cachedStorage = undefined; }, 0);
  return _cachedStorage;
};
