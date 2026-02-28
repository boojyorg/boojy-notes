let _blockId = 0;
export const genBlockId = () => `blk-${Date.now()}-${++_blockId}`;
export const setBlockIdCounter = (val) => { _blockId = val; };

let _noteId = 0;
export const genNoteId = () => `note-${Date.now()}-${++_noteId}`;

export const STORAGE_KEY = "boojy-notes-v1";
let _cachedStorage;
export const loadFromStorage = () => {
  if (_cachedStorage !== undefined) return _cachedStorage;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cachedStorage = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    _cachedStorage = null;
  }
  return _cachedStorage;
};
