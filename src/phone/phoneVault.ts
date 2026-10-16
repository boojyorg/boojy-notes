import { contentHash } from "../sync/contentHash";
import type { LocalStore } from "../sync/types";
import type { Note, NoteData } from "../types/notes";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
  parseFrontmatter,
} from "../utils/markdown";
import { genNoteId } from "../utils/storage";
import type { FileOps } from "./files";

/**
 * The phone's vault: ordinary `.md` files in the app's private storage,
 * edited by the app and synced by the engine. It answers the calls the
 * desktop's main process answers for the editor (read all notes, write one,
 * trash one, folders), and it is also the engine's LocalStore, so a file the
 * engine changes reaches the editor as the desktop watcher's events would:
 * changed, moved or deleted on disk, taken by the same code.
 *
 * Every operation runs one at a time. A save the editor asked for before the
 * engine changed that note's file is refused as stale (the editor then keeps
 * both versions), and the engine is refused a change to a note whose save is
 * waiting (its next pass sees both sides changed and keeps both).
 */

const VAULT = "vault";
const STATE = "state";
const TRASH = "deleted";

type PhoneNote = Note & { id: string; _filePath?: string };
type Listener<T> = (payload: T) => void;

export interface PhoneVaultAPI {
  getNotesDir(): Promise<string>;
  readAllNotes(): Promise<NoteData>;
  writeNote(note: Note): Promise<{ title: string } | { stale: true; note: PhoneNote | null }>;
  trashNote(id: string): Promise<{ trashed?: true; missing?: true }>;
  readFolders(): Promise<string[]>;
  readOtherFiles(): Promise<never[]>;
  createFolder(rel: string): Promise<{ path: string }>;
  renameFolder(from: string, to: string): Promise<{ path: string }>;
  deleteFolder(rel: string): Promise<{ removed: boolean }>;
  duplicateFolder(rel: string): Promise<never>;
  onFileChanged(cb: Listener<PhoneNote>): () => void;
  onFileMoved(cb: Listener<PhoneNote>): () => void;
  onFileDeleted(cb: Listener<void>): () => void;
  onFoldersChanged(cb: Listener<void>): () => void;
}

// ─── Names (the desktop's rules, electron/noteFileManager.js) ───

const MAX_NAME_BYTES = 200;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)$/i;
const encoder = new TextEncoder();

function capBytes(name: string) {
  if (encoder.encode(name).length <= MAX_NAME_BYTES) return name;
  let out = "";
  for (const ch of name) {
    if (encoder.encode(out + ch).length > MAX_NAME_BYTES) break;
    out += ch;
  }
  return out;
}

export function sanitizeFilename(name: string) {
  let safe = capBytes(name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")).trim() || "Untitled";
  if (safe.startsWith(".")) safe = `_${safe.slice(1)}`;
  const dot = safe.indexOf(".");
  const stem = (dot === -1 ? safe : safe.slice(0, dot)).trimEnd();
  if (WINDOWS_DEVICE.test(stem)) safe = `${stem}_${dot === -1 ? "" : safe.slice(dot)}`;
  return safe;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("/");
const parentOf = (rel: string) => rel.split("/").slice(0, -1).join("/") || null;
const baseName = (rel: string) => (rel.split("/").pop() ?? "").replace(/\.md$/, "");
const hidden = (name: string) => name.startsWith(".");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** One operation at a time, in the order asked. */
function createLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.catch(() => {});
    return run;
  };
}

export function createPhoneVault(files: FileOps, { onLocalChange = () => {} } = {}) {
  const lock = createLock();
  const abs = (rel: string) => join(VAULT, rel);

  /** note id → its file, vault-relative. Kept across launches, so ids are stable. */
  let index: Record<string, string> | null = null;
  /** The text the editor last read or wrote, per note: a save over anything else is stale. */
  const seen = new Map<string, string>();
  /** Ordering stamps: when the engine last changed a note, and when each save was asked for. */
  let clock = 0;
  const changedAt = new Map<string, number>();
  /** When the engine last renamed a note, and the name it had before. */
  const movedAt = new Map<string, { at: number; title: string; folder: string | null }>();
  /** Saves asked for and not yet done, per note. */
  const waiting = new Map<string, number>();

  const listeners = {
    changed: new Set<Listener<PhoneNote>>(),
    moved: new Set<Listener<PhoneNote>>(),
    deleted: new Set<Listener<void>>(),
    folders: new Set<Listener<void>>(),
  };
  const emit = <T>(set: Set<Listener<T>>, payload: T) => {
    for (const cb of set) cb(payload);
  };
  const subscribe =
    <T>(set: Set<Listener<T>>) =>
    (cb: Listener<T>) => {
      set.add(cb);
      return () => set.delete(cb);
    };

  const loadIndex = async () => {
    if (index) return index;
    const bytes = await files.read(join(STATE, "ids.json"));
    index = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    return index as Record<string, string>;
  };
  const saveIndex = () =>
    files.write(join(STATE, "ids.json"), encoder.encode(JSON.stringify(index)));
  const idAt = (rel: string) => {
    const key = rel.toLowerCase();
    for (const [id, p] of Object.entries(index ?? {})) if (p.toLowerCase() === key) return id;
    return null;
  };

  const readText = async (rel: string) => {
    const bytes = await files.read(abs(rel));
    if (!bytes) return null;
    try {
      return strictUtf8.decode(bytes);
    } catch {
      return null;
    }
  };

  /** A note as its file holds it; a file the editor cannot hold as text is left out. */
  const parse = async (rel: string): Promise<PhoneNote | null> => {
    const raw = await readText(rel);
    if (raw === null) return null;
    let body = raw;
    let legacyId: string | null = null;
    const fm = parseFrontmatter(raw);
    if (fm?.id && /^note-\d+-/.test(fm.id)) {
      legacyId = fm.id;
      body = fm.body;
    }
    const idx = await loadIndex();
    let id = idAt(rel);
    if (!id && legacyId && !(legacyId in idx)) id = legacyId;
    if (!id) id = genNoteId();
    idx[id] = rel;
    seen.set(id, raw);
    const title = baseName(rel);
    const content: Note["content"] = { title, blocks: markdownToBlocks(body) };
    if (detectEol(raw) === "\r\n") content.eol = "\r\n";
    return {
      id,
      title,
      folder: parentOf(rel),
      content,
      lastModified: (await files.mtime(abs(rel))) ?? Date.now(),
    };
  };

  /** Every file and folder under the vault, vault-relative; dot entries skipped. */
  const walk = async () => {
    const found = { files: [] as string[], folders: [] as string[] };
    const visit = async (rel: string) => {
      for (const entry of await files.list(abs(rel))) {
        if (hidden(entry.name)) continue;
        const path = join(rel, entry.name);
        if (entry.kind === "dir") {
          found.folders.push(path);
          await visit(path);
        } else {
          found.files.push(path);
        }
      }
    };
    await visit("");
    return found;
  };

  /**
   * The first of `name`, `name-2`, … free in `dir`, ignoring case: Android
   * holds `Shopping.md` and `shopping.md` apart, but Dropbox and a Mac take
   * them for one file, and the engine would sync neither. `own` is the entry
   * being renamed, which never collides with itself.
   */
  const freeName = async (dir: string | null, name: string, ext: string, own?: string) => {
    const taken = new Set((await files.list(abs(dir ?? ""))).map((e) => e.name.toLowerCase()));
    taken.delete(own?.toLowerCase() ?? "");
    if (!taken.has(`${name}${ext}`.toLowerCase())) return join(dir, `${name}${ext}`);
    for (let i = 2; ; i++) {
      if (!taken.has(`${name}-${i}${ext}`.toLowerCase())) return join(dir, `${name}-${i}${ext}`);
    }
  };

  /** Where a note goes: its folder, a name from its title, `-2`… when taken by another file. */
  const targetFor = async (note: Note, ownRel: string | null) => {
    const own = ownRel ? baseName(ownRel) : null;
    const name = note.title === own ? own : sanitizeFilename(note.title || "Untitled");
    const ownHere = ownRel && parentOf(ownRel) === (note.folder ?? null) ? `${own}.md` : undefined;
    return freeName(note.folder ?? null, name, ".md", ownHere);
  };

  const moveToDeleted = async (rel: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await files.rename(abs(rel), join(TRASH, stamp, rel));
  };

  // ─── What the editor calls ───

  const api: PhoneVaultAPI = {
    getNotesDir: async () => "Phone",

    readAllNotes: () =>
      lock(async () => {
        const idx = await loadIndex();
        const notes: NoteData = {};
        const { files: paths } = await walk();
        for (const rel of paths) {
          if (!rel.toLowerCase().endsWith(".md")) continue;
          const note = await parse(rel);
          if (note) notes[note.id] = note;
        }
        for (const [id, rel] of Object.entries(idx)) {
          if (!notes[id] || notes[id].folder !== parentOf(rel)) {
            if (!(await files.exists(abs(rel)))) delete idx[id];
          }
        }
        await saveIndex();
        return notes;
      }),

    writeNote(note) {
      const id = note.id as string;
      const askedAt = ++clock;
      waiting.set(id, (waiting.get(id) ?? 0) + 1);
      return lock(async () => {
        try {
          const idx = await loadIndex();
          const ownRel = idx[id] ?? null;
          const onDisk = ownRel ? await readText(ownRel) : null;
          // The engine changed the file after this save was asked for, or the
          // file holds text the editor has not seen: the save would put the
          // editor's version over it.
          const stale =
            ownRel &&
            onDisk !== null &&
            ((changedAt.get(id) ?? 0) > askedAt || (seen.has(id) && seen.get(id) !== onDisk));
          if (stale) return { stale: true as const, note: await parse(ownRel) };

          // Renamed by the engine after this save was asked for, and the save
          // still carries the old name: the new name stands (the editor is
          // taking it from the moved event), the text is the save's.
          const moved = movedAt.get(id);
          const target =
            ownRel &&
            moved &&
            moved.at > askedAt &&
            note.title === moved.title &&
            (note.folder ?? null) === moved.folder
              ? ownRel
              : await targetFor(note, ownRel);
          const renaming = !!ownRel && onDisk !== null && target !== ownRel;
          if (renaming) {
            await files.rename(abs(ownRel), abs(target));
            idx[id] = target;
            await saveIndex();
          }
          const body = applyEol(blocksToMarkdown(note.content?.blocks || []), note.content?.eol);
          // A rename with unchanged text is the rename alone (PR #350's rule).
          if (!(renaming && onDisk === body)) await files.write(abs(target), encoder.encode(body));
          idx[id] = target;
          seen.set(id, body);
          await saveIndex();
          onLocalChange();
          return { title: baseName(target) };
        } finally {
          const left = (waiting.get(id) ?? 1) - 1;
          if (left > 0) waiting.set(id, left);
          else waiting.delete(id);
        }
      });
    },

    trashNote: (id) =>
      lock(async () => {
        const idx = await loadIndex();
        const rel = idx[id];
        if (!rel || !(await files.exists(abs(rel)))) return { missing: true as const };
        await moveToDeleted(rel);
        delete idx[id];
        seen.delete(id);
        await saveIndex();
        onLocalChange();
        return { trashed: true as const };
      }),

    readFolders: () => lock(async () => (await walk()).folders.sort()),
    readOtherFiles: async () => [],

    createFolder: (rel) =>
      lock(async () => {
        const name = sanitizeFilename(rel.split("/").pop() ?? "");
        const path = await freeName(parentOf(rel), name, "");
        await files.mkdir(abs(path));
        onLocalChange();
        return { path };
      }),

    renameFolder: (from, to) =>
      lock(async () => {
        const path = join(parentOf(to), sanitizeFilename(to.split("/").pop() ?? ""));
        await files.rename(abs(from), abs(path));
        const idx = await loadIndex();
        for (const [id, rel] of Object.entries(idx)) {
          if (rel.startsWith(`${from}/`)) idx[id] = path + rel.slice(from.length);
        }
        await saveIndex();
        onLocalChange();
        return { path };
      }),

    deleteFolder: (rel) =>
      lock(async () => {
        const removeIfEmpty = async (dir: string): Promise<boolean> => {
          for (const entry of await files.list(abs(dir))) {
            if (entry.kind === "file") return false;
            if (!(await removeIfEmpty(join(dir, entry.name)))) return false;
          }
          await files.rmdir(abs(dir));
          return true;
        };
        const removed = await removeIfEmpty(rel);
        if (removed) onLocalChange();
        return { removed };
      }),

    duplicateFolder: async () => {
      throw new Error("Duplicating a folder is not on the phone yet");
    },

    onFileChanged: subscribe(listeners.changed),
    onFileMoved: subscribe(listeners.moved),
    onFileDeleted: subscribe(listeners.deleted),
    onFoldersChanged: subscribe(listeners.folders),
  };

  // ─── What the sync engine calls ───

  const hashAt = async (rel: string) => {
    const bytes = await files.read(abs(rel));
    return bytes ? contentHash(bytes) : null;
  };
  /** A save is waiting for the note at `rel`: the engine must not change it underneath. */
  const saveWaiting = (rel: string) => {
    const id = idAt(rel);
    return id !== null && (waiting.get(id) ?? 0) > 0;
  };
  const isNote = (rel: string) => rel.toLowerCase().endsWith(".md");

  const store: LocalStore = {
    list: () => lock(walk),
    read: (rel) => lock(() => files.read(abs(rel))),

    writeIfUnchanged: (rel, bytes, expected) =>
      lock(async () => {
        await loadIndex();
        if ((await hashAt(rel)) !== expected || saveWaiting(rel)) return false;
        const newFolder = parentOf(rel) && !(await files.exists(abs(parentOf(rel) as string)));
        await files.write(abs(rel), bytes);
        if (isNote(rel)) {
          const note = await parse(rel);
          await saveIndex();
          if (note) {
            changedAt.set(note.id, ++clock);
            emit(listeners.changed, note);
          }
        }
        if (newFolder) emit(listeners.folders, undefined);
        return true;
      }),

    removeIfUnchanged: (rel, expected) =>
      lock(async () => {
        await loadIndex();
        if ((await hashAt(rel)) !== expected || saveWaiting(rel)) return false;
        await moveToDeleted(rel);
        const id = idAt(rel);
        if (id) {
          delete (index as Record<string, string>)[id];
          seen.delete(id);
          changedAt.set(id, ++clock);
          await saveIndex();
        }
        if (isNote(rel)) emit(listeners.deleted, undefined);
        return true;
      }),

    rename: (from, to) =>
      lock(async () => {
        const idx = await loadIndex();
        if (await files.exists(abs(to))) throw new Error(`${to} already exists`);
        await files.rename(abs(from), abs(to));
        const id = idAt(from);
        if (id) {
          idx[id] = to;
          movedAt.set(id, { at: ++clock, title: baseName(from), folder: parentOf(from) });
          const note = isNote(to) ? await parse(to) : null;
          await saveIndex();
          if (note) emit(listeners.moved, note);
        }
        emit(listeners.folders, undefined);
      }),

    exists: (rel) => lock(() => files.exists(abs(rel))),

    makeFolder: (rel) =>
      lock(async () => {
        await files.mkdir(abs(rel));
        emit(listeners.folders, undefined);
      }),

    removeFolderIfEmpty: (rel) =>
      lock(async () => {
        if ((await files.list(abs(rel))).length > 0) return;
        await files.rmdir(abs(rel));
        emit(listeners.folders, undefined);
      }),

    loadRecord: async () => {
      const bytes = await files.read(join(STATE, "sync-record.json"));
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    saveRecord: (text) => files.write(join(STATE, "sync-record.json"), encoder.encode(text)),
  };

  return { api, store };
}
