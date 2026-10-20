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
 * A deleted note leaves the vault for `deleted/<when>/<where it was>`, its
 * bytes untouched, and is Recently Deleted for 30 days: the desktop's list,
 * view, Restore and delete-for-good calls, answered here. `state/deleted.json`
 * keeps each one's id, so it comes back as the same note. Every step is
 * ordered so a crash between two leaves a state the next read puts right:
 * the bin's entry is written before its file moves in and dropped after it
 * moves out (an entry without its file is dropped, a file without an entry is
 * adopted under a new id, kept from then on). A restore is also noted for
 * sync (`state/restored.json`, `restored`): a pass that binned the note
 * and died before recording it would otherwise delete it again.
 *
 * Every operation runs one at a time. A save the editor asked for before the
 * engine changed that note's file is refused as stale (the editor then keeps
 * both versions), and the engine is refused a change to a note whose save is
 * waiting (its next pass sees both sides changed and keeps both).
 */

const VAULT = "vault";
const UNREADABLE = Symbol("unreadable");
const STATE = "state";
const TRASH = "deleted";
const DAY = 24 * 60 * 60 * 1000;
const DELETED_KEEP_MS = 30 * DAY;

type PhoneNote = Note & { id: string; _filePath?: string };
type Listener<T> = (payload: T) => void;

/** A note in the bin: its file under `deleted/` (`<when>/<where it was>`), and when it went. */
interface BinEntry {
  path: string;
  at: number;
}

/** Recently Deleted's row, as the desktop's `list-deleted-notes` answers it. */
export interface DeletedNoteRow {
  id: string;
  name: string;
  /** The folder it was in, vault-relative; "" at the root. */
  folder: string;
  at: number;
}

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
  /** Recently Deleted: the notes deleted in the last 30 days, newest first (older ones go). */
  listDeletedNotes(): Promise<DeletedNoteRow[]>;
  readDeletedNote(id: string): Promise<string | null>;
  /** Back where it was, the folder made again, `-2` if the name is taken, the same id. */
  restoreDeletedNote(id: string): Promise<PhoneNote | null>;
  purgeDeletedNote(id: string): Promise<boolean>;
  onDeletedNotesChanged(cb: Listener<void>): () => void;
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

/**
 * A folder's name, as the desktop's (`electron/folders.ts`): a filename's
 * rules, no trailing dots or spaces (Windows drops them from a folder), and
 * never `attachments`, the desktop's attachment store, which hides its notes.
 */
export function sanitizeFolderName(name: string) {
  const trailing = /[. ]+$/;
  const safe = sanitizeFilename(name.replace(trailing, "")).replace(trailing, "") || "Untitled";
  return safe === "attachments" ? `_${safe}` : safe;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("/");
const parentOf = (rel: string) => rel.split("/").slice(0, -1).join("/") || null;
const baseName = (rel: string) => (rel.split("/").pop() ?? "").replace(/\.md$/, "");
const hidden = (name: string) => name.startsWith(".");
const isNote = (rel: string) => rel.toLowerCase().endsWith(".md");
/** The first segment of a bin path is when it went; the rest is where it was. */
const splitBinPath = (path: string) => {
  const at = path.indexOf("/");
  return { stamp: path.slice(0, at), rel: path.slice(at + 1) };
};
const stampOf = (at: number) => new Date(at).toISOString().replace(/[:.]/g, "-");
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;
const timeOfStamp = (stamp: string) => {
  const m = STAMP_RE.exec(stamp);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
};
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

export function createPhoneVault(
  disk: FileOps,
  { onLocalChange = () => {}, now = () => Date.now() } = {},
) {
  const lock = createLock();
  const abs = (rel: string) => join(VAULT, rel);

  // The content hashes sync asked for (`hash`), each kept while its file's
  // stamp (size and modified time, as the latest walk listed it) holds, so a
  // pass reads only what changed: reading every file each pass held up
  // Android's UI thread, which draws the page. Every write, rename and removal
  // the app makes forgets what it touched, so a rewrite within one modified
  // time at the same size is never taken for the old bytes; forgotten
  // whether the call succeeds or not, as a failed write may still have landed.
  // Nothing else writes the app's private storage.
  const stamps = new Map<string, string>();
  const hashes = new Map<string, { stamp: string; hash: string }>();
  /** Forgets `path`; `folder` also what was under it (a rename may move a folder). */
  const forget = (path: string, folder = false) => {
    if (!path.startsWith(`${VAULT}/`)) return;
    stamps.delete(path);
    hashes.delete(path);
    if (!folder) return;
    for (const map of [stamps, hashes])
      for (const key of [...map.keys()]) if (key.startsWith(`${path}/`)) map.delete(key);
  };
  const files: FileOps = {
    ...disk,
    async write(path, bytes) {
      try {
        await disk.write(path, bytes);
      } finally {
        forget(path);
      }
    },
    async rename(from, to) {
      try {
        await disk.rename(from, to);
      } finally {
        forget(from, true);
        forget(to, true);
      }
    },
    async remove(path) {
      try {
        await disk.remove(path);
      } finally {
        forget(path);
      }
    },
  };

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
    bin: new Set<Listener<void>>(),
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

  /** The file's text; null when it is gone, UNREADABLE when it is not UTF-8. */
  const readText = async (rel: string): Promise<string | null | typeof UNREADABLE> => {
    const bytes = await files.read(abs(rel));
    if (!bytes) return null;
    try {
      return strictUtf8.decode(bytes);
    } catch {
      return UNREADABLE;
    }
  };

  /**
   * A note as its file holds it; null only when the file is gone. A file the
   * editor cannot hold as text is listed as unreadable, as on the desktop:
   * no blocks, never written, only moved.
   */
  const parse = async (rel: string): Promise<PhoneNote | null> => {
    const raw = await readText(rel);
    if (raw === null) return null;
    if (raw === UNREADABLE) {
      const idx = await loadIndex();
      const id = idAt(rel) ?? genNoteId();
      idx[id] = rel;
      seen.delete(id);
      const title = baseName(rel);
      return {
        id,
        title,
        folder: parentOf(rel),
        content: { title, blocks: [] },
        lastModified: (await files.mtime(abs(rel))) ?? Date.now(),
        unreadable: "encoding",
      };
    }
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
          stamps.set(abs(path), `${entry.size}:${entry.mtime}`);
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

  // ─── Recently Deleted ───

  /** note id → its place in the bin. */
  let bin: Record<string, BinEntry> | null = null;
  const loadBin = async () => {
    if (bin) return bin;
    const bytes = await files.read(join(STATE, "deleted.json"));
    bin = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    return bin as Record<string, BinEntry>;
  };
  const saveBin = () =>
    files.write(join(STATE, "deleted.json"), encoder.encode(JSON.stringify(bin)));

  /** Paths put back from the bin, kept until a sync pass has recorded them (LocalStore's `restored`). */
  const readRestored = async (): Promise<string[]> => {
    const bytes = await files.read(join(STATE, "restored.json"));
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : [];
  };
  const writeRestored = (paths: string[]) =>
    files.write(join(STATE, "restored.json"), encoder.encode(JSON.stringify(paths)));

  /** Out of the vault into the bin; a note with an id is recorded first, so it comes back as itself. */
  const moveToDeleted = async (rel: string, id: string | null) => {
    const at = now();
    const path = join(stampOf(at), rel);
    if (id) {
      (await loadBin())[id] = { path, at };
      await saveBin();
    }
    await files.rename(abs(rel), join(TRASH, path));
    emit(listeners.bin, undefined);
  };

  /** Removes the folders above a bin file that hold nothing any more, up to the bin itself. */
  const dropEmptyParents = async (path: string) => {
    for (let dir = parentOf(path); dir && dir !== TRASH; dir = parentOf(dir)) {
      if ((await files.list(dir)).length > 0) return;
      await files.rmdir(dir);
    }
  };

  const removeTree = async (dir: string) => {
    for (const entry of await files.list(dir)) {
      const path = join(dir, entry.name);
      if (entry.kind === "dir") await removeTree(path);
      else await files.remove(path);
    }
    await files.rmdir(dir);
  };

  /**
   * The bin as it should be: whatever went over 30 days ago goes for good
   * (every file of that moment, notes or not), an entry whose file is gone is
   * dropped, and a note there with no entry is adopted.
   */
  const tidyBin = async () => {
    const entries = await loadBin();
    let changed = false;
    const notesIn: string[] = [];
    for (const moment of await files.list(TRASH)) {
      if (moment.kind !== "dir") continue;
      const at = timeOfStamp(moment.name);
      if (at !== null && now() - at > DELETED_KEEP_MS) {
        await removeTree(join(TRASH, moment.name));
        changed = true;
        continue;
      }
      const visit = async (rel: string) => {
        for (const entry of await files.list(join(TRASH, rel))) {
          if (hidden(entry.name)) continue;
          const path = join(rel, entry.name);
          if (entry.kind === "dir") await visit(path);
          else if (isNote(path)) notesIn.push(path);
        }
      };
      await visit(moment.name);
    }
    const found = new Set(notesIn);
    for (const [id, entry] of Object.entries(entries)) {
      if (!found.has(entry.path)) {
        delete entries[id];
        changed = true;
      }
    }
    const known = new Set(Object.values(entries).map((e) => e.path));
    for (const path of notesIn) {
      if (known.has(path)) continue;
      entries[genNoteId()] = { path, at: timeOfStamp(splitBinPath(path).stamp) ?? now() };
      changed = true;
    }
    if (changed) await saveBin();
    return entries;
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
          // A file that is no longer text is never written over either.
          const stale =
            ownRel &&
            onDisk !== null &&
            ((changedAt.get(id) ?? 0) > askedAt ||
              (seen.has(id) && seen.get(id) !== onDisk) ||
              (onDisk === UNREADABLE && !note.unreadable));
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
          // An unreadable note holds no text of its own: it is only ever moved.
          if (note.unreadable) {
            if (renaming) onLocalChange();
            return { title: baseName(target) };
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
        await moveToDeleted(rel, id);
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
        const name = sanitizeFolderName(rel.split("/").pop() ?? "");
        const path = await freeName(parentOf(rel), name, "");
        await files.mkdir(abs(path));
        onLocalChange();
        return { path };
      }),

    renameFolder: (from, to) =>
      lock(async () => {
        if (to === from || to.startsWith(`${from}/`)) {
          if (to === from) return { path: from };
          throw new Error("A folder cannot be moved into itself");
        }
        // A new name is the app's to make safe; a move keeps the name the disk holds.
        const own = from.split("/").pop() ?? "";
        const asked = to.split("/").pop() ?? "";
        const name = asked === own ? own : sanitizeFolderName(asked);
        const sameParent = parentOf(from) === parentOf(to);
        // Its own name never counts as taken: a change of capitals alone is a rename.
        const path = await freeName(parentOf(to), name, "", sameParent ? own : undefined);
        if (path === from) return { path };
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

    listDeletedNotes: () =>
      lock(async () =>
        Object.entries(await tidyBin())
          .map(([id, { path, at }]) => {
            const { rel } = splitBinPath(path);
            return { id, name: baseName(rel), folder: parentOf(rel) ?? "", at };
          })
          .sort((a, b) => b.at - a.at),
      ),

    readDeletedNote: (id) =>
      lock(async () => {
        const entry = (await loadBin())[id];
        if (!entry) return null;
        const bytes = await files.read(join(TRASH, entry.path));
        if (!bytes) return null;
        try {
          return strictUtf8.decode(bytes);
        } catch {
          return null;
        }
      }),

    restoreDeletedNote: (id) =>
      lock(async () => {
        const entries = await loadBin();
        const entry = entries[id];
        if (!entry) return null;
        const from = join(TRASH, entry.path);
        if (!(await files.exists(from))) {
          delete entries[id];
          await saveBin();
          emit(listeners.bin, undefined);
          return null;
        }
        const { rel } = splitBinPath(entry.path);
        const folder = parentOf(rel);
        const newFolder = !!folder && !(await files.exists(abs(folder)));
        const target = await freeName(folder, baseName(rel), ".md");
        // The id at its new place, and the restore noted for sync, first: a
        // crash before the file moves leaves an index entry for a missing
        // file, which the next read drops, and a note sync finds nothing for.
        const idx = await loadIndex();
        idx[id] = target;
        await saveIndex();
        await writeRestored([...(await readRestored()), target]);
        // Moved, not rewritten: the bytes are the ones that were deleted.
        await files.rename(from, abs(target));
        delete entries[id];
        await saveBin();
        await dropEmptyParents(from);
        const restored = await parse(target);
        await saveIndex();
        onLocalChange();
        emit(listeners.bin, undefined);
        if (newFolder) emit(listeners.folders, undefined);
        return restored;
      }),

    purgeDeletedNote: (id) =>
      lock(async () => {
        const entries = await loadBin();
        const entry = entries[id];
        if (!entry) return false;
        const path = join(TRASH, entry.path);
        if (await files.exists(path)) await files.remove(path);
        delete entries[id];
        await saveBin();
        await dropEmptyParents(path);
        emit(listeners.bin, undefined);
        return true;
      }),

    onFileChanged: subscribe(listeners.changed),
    onFileMoved: subscribe(listeners.moved),
    onFileDeleted: subscribe(listeners.deleted),
    onFoldersChanged: subscribe(listeners.folders),
    onDeletedNotesChanged: subscribe(listeners.bin),
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

  const store: LocalStore = {
    list: () => lock(walk),
    read: (rel) => lock(() => files.read(abs(rel))),

    hash: (rel) =>
      lock(async () => {
        const path = abs(rel);
        const stamp = stamps.get(path);
        const known = hashes.get(path);
        if (stamp && known?.stamp === stamp) return known.hash;
        const hash = await hashAt(rel);
        if (hash && stamp) hashes.set(path, { stamp, hash });
        return hash;
      }),

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
        const id = idAt(rel);
        await moveToDeleted(rel, isNote(rel) ? id : null);
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

    restored: () => lock(readRestored),

    forgetRestored: (taken) =>
      lock(async () => {
        const paths = await readRestored();
        const left = paths.filter((p) => !taken.includes(p));
        if (left.length !== paths.length) await writeRestored(left);
      }),

    loadRecord: async () => {
      const bytes = await files.read(join(STATE, "sync-record.json"));
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    saveRecord: (text) => files.write(join(STATE, "sync-record.json"), encoder.encode(text)),
  };

  return { api, store };
}
