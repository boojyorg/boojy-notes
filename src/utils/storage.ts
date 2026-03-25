const rand = (): string => Math.random().toString(36).slice(2, 7);
export const genBlockId = (): string => `blk-${Date.now()}-${rand()}`;
export const genNoteId = (): string => `note-${Date.now()}-${rand()}`;

export const STORAGE_KEY = "boojy-notes-v1";
const SCHEMA_VERSION_KEY = "boojy-schema-version";
export const CURRENT_SCHEMA_VERSION = 1;

// Migration registry: [fromVersion, migrationFn]
const migrations: Array<[number, (data: Record<string, unknown>) => Record<string, unknown>]> = [
  // Example: [1, (data) => { /* migrate from v1 to v2 */ return data; }]
];

export function migrateSchema(data: Record<string, unknown>): Record<string, unknown> {
  let version = 0;
  try {
    version = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || "0", 10) || 0;
  } catch {}
  let result = data;
  for (const [fromVer, fn] of migrations) {
    if (version <= fromVer) {
      result = fn(result);
    }
  }
  try {
    localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  } catch {}
  return result;
}

// ─── IndexedDB fallback for large data ─────────────────────────────
const IDB_NAME = "boojy-notes";
const IDB_STORE = "data";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToIDB(data: Record<string, unknown>): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, STORAGE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadFromIDB(): Promise<Record<string, unknown> | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export const loadFromStorage = (): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : null;
    if (data) data = migrateSchema(data);
    return data;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    return null;
  }
};
