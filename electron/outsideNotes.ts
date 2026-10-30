import fs from "node:fs";
import path from "node:path";
import { ipcMain, type BrowserWindow } from "electron";
import { applyEol, blocksToMarkdown, detectEol, markdownToBlocks } from "../src/utils/markdown.js";
import { renameWithRetry, writeFileAtomic } from "./atomicWrite.js";
import {
  ensureUniqueFilePath,
  hashOf,
  MAX_NOTE_BYTES,
  noteText,
  realBasename,
  sanitizeFilename,
} from "./noteFileManager.js";
import { trace } from "./trace.js";
import { isSameEntry } from "./vaultFs.js";

/**
 * A note whose file is in none of the storage locations, opened from Finder
 * (openRequests.ts): edited in place, as Typora or iA Writer would. It never
 * touches a location's index, history or Recently Deleted; the app holds it
 * for the session only, by its real path.
 *
 * The rules a location's note keeps, kept here on their own:
 * - a save never lands over bytes the app has not seen (`stale`, as
 *   `write-note`), and a conflict copy is written beside the file;
 * - a rename moves the file within its own folder, named as a note is;
 * - the file's folder is watched alone, not recursively, for the file only:
 *   an editor's replace-style save, a rename in that folder (followed by the
 *   inode) and a delete all reach the window. The bytes last read or written
 *   are the app's own: an event that finds them is its own save's echo.
 */

/** `gone`: reported gone, and not said again until the file is written or read once more. */
type Entry = { path: string; hash: string | null; dev: number; ino: number; gone?: boolean };

/** A note the renderer takes: `outside` is the folder its file is in. */
export type OutsideNote = {
  id: string;
  title: string;
  folder: null;
  outside: string;
  content: { title: string; blocks: unknown[]; eol?: string };
  lastModified: number;
};

const SETTLE_MS = 300;
const entries = new Map<string, Entry>();
const watches = new Map<string, { watcher: fs.FSWatcher; timer: NodeJS.Timeout | null }>();
let window: () => BrowserWindow | null = () => null;

const realPath = (p: string) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
};

const idFor = (real: string) => [...entries].find(([, e]) => e.path === real)?.[0] ?? null;

function record(id: string, filePath: string, text: string | null) {
  const stat = fs.statSync(filePath);
  entries.set(id, {
    path: filePath,
    hash: text === null ? null : hashOf(text),
    dev: stat.dev,
    ino: stat.ino,
  });
}

/** The note `filePath` holds, as `id`; null if it is gone or not text the app can edit. */
function readNote(id: string, filePath: string): OutsideNote | "unreadable" | null {
  let bytes: Buffer;
  try {
    if (fs.statSync(filePath).size > MAX_NOTE_BYTES) return "unreadable";
    bytes = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  const raw = noteText(bytes);
  if (raw === null) return "unreadable";
  // Read is seen: a save after this compares the disk with these bytes.
  record(id, filePath, raw);
  const title = path.basename(filePath, path.extname(filePath));
  const content: OutsideNote["content"] = { title, blocks: markdownToBlocks(raw) };
  if (detectEol(raw) === "\r\n") content.eol = "\r\n";
  return {
    id,
    title,
    folder: null,
    outside: path.dirname(filePath),
    content,
    lastModified: Math.round(fs.statSync(filePath).mtimeMs),
  };
}

/** Whether `dir` holds a file the app has open: the only folders it writes in. */
const isOpenFolder = (dir: string) =>
  [...entries.values()].some((e) => path.dirname(e.path) === dir);

/** A picture beside an open outside note: its real path, only inside such a folder. */
export function outsideAttachment(filePath: string): string | null {
  const real = realPath(filePath);
  if (!real) return null;
  for (const e of entries.values()) {
    const root = path.dirname(e.path);
    if (real.startsWith(root + path.sep)) return real;
  }
  return null;
}

function watchFolder(dir: string) {
  if (watches.has(dir)) return;
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(dir, { persistent: false }, (eventType, name) => {
      trace("M", "outside folder event", eventType, String(name ?? ""), dir);
      const w = watches.get(dir);
      if (!w) return;
      if (w.timer) clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        w.timer = null;
        checkFolder(dir);
      }, SETTLE_MS);
    });
  } catch (error) {
    trace("M", "outside folder not watched", dir, String(error));
    console.warn("outside note: folder not watched", dir, String(error));
    return;
  }
  watcher.on("error", (error) => {
    trace("M", "outside folder watch failed", dir, String(error));
    watches.delete(dir);
  });
  trace("M", "outside folder watched", dir);
  watches.set(dir, { watcher, timer: null });
}

/** Each open file in `dir`, after its events have settled. */
function checkFolder(dir: string) {
  const win = window();
  for (const [id, e] of entries) {
    if (path.dirname(e.path) !== dir) continue;
    if (fs.existsSync(e.path)) {
      let raw: string | null;
      try {
        raw = noteText(fs.readFileSync(e.path));
      } catch {
        continue;
      }
      if (raw !== null && hashOf(raw) === e.hash) continue;
      const note = readNote(id, e.path);
      if (note && note !== "unreadable") {
        trace("M", "outside note changed", e.path);
        win?.webContents.send("file-changed", note);
      }
      continue;
    }
    // Renamed in the same folder: the same file, by its inode. A folder that
    // has gone with it holds nothing to follow.
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {}
    const moved = names
      .map((name) => path.join(dir, name))
      .find((p) => {
        try {
          const st = fs.statSync(p);
          return st.isFile() && st.dev === e.dev && st.ino === e.ino;
        } catch {
          return false;
        }
      });
    if (moved) {
      trace("M", "outside note renamed", e.path, "→", moved);
      e.path = moved;
      const title = path.basename(moved, path.extname(moved));
      win?.webContents.send("file-moved", { id, title, folder: null });
      continue;
    }
    if (e.gone) continue;
    e.gone = true;
    trace("M", "outside note gone", e.path);
    win?.webContents.send("outside-note-gone", { id, title: path.basename(e.path, ".md") });
  }
}

/**
 * Every open outside note looked at again, as the folder watch would: the
 * window coming back to the front asks, so an edit made in another app is
 * there when the user returns, even where a folder cannot be watched.
 */
export function checkOutsideNotes() {
  for (const dir of new Set([...entries.values()].map((e) => path.dirname(e.path)))) {
    checkFolder(dir);
  }
}

/** Open `filePath`: the note, the id the app already has it under, or why not. */
export function openOutsideNote(filePath: string) {
  const real = realPath(filePath);
  if (!real) return { error: "missing" as const };
  const known = idFor(real);
  if (known) return { id: known };
  const id = `outside-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const note = readNote(id, real);
  if (note === null) return { error: "missing" as const };
  if (note === "unreadable") {
    entries.delete(id);
    return { error: "unreadable" as const };
  }
  watchFolder(path.dirname(real));
  return { note };
}

/**
 * Write the note: its own file, renamed in its folder when its title changed,
 * or (an id the app has not opened) a new file in an open note's folder, as a
 * conflict copy is.
 */
export function writeOutsideNote(note: OutsideNote) {
  const entry = entries.get(note.id);
  const dir = entry ? path.dirname(entry.path) : note.outside;
  if (!entry && !(typeof dir === "string" && isOpenFolder(dir)))
    throw new Error("Not a folder of an open outside note");
  const existing = entry?.path ?? null;

  if (existing && entry?.hash && fs.existsSync(existing)) {
    let onDisk: string | null = null;
    try {
      onDisk = noteText(fs.readFileSync(existing));
    } catch {}
    if (onDisk === null || hashOf(onDisk) !== entry.hash) {
      trace("M", "write-outside-note refused: file changed on disk", existing);
      const fresh = readNote(note.id, existing);
      return { stale: true, note: fresh === "unreadable" ? null : fresh };
    }
  }

  const ownName = existing ? path.basename(existing, ".md") : null;
  const name = note.title === ownName ? ownName : sanitizeFilename(note.title || "Untitled");
  const target = path.join(dir, `${name}.md`);
  const finalPath =
    existing && (existing === target || (fs.existsSync(target) && isSameEntry(existing, target)))
      ? target
      : ensureUniqueFilePath(target, existing);
  const body = applyEol(blocksToMarkdown(note.content?.blocks ?? []), note.content?.eol);

  const renaming = !!existing && existing !== finalPath && fs.existsSync(existing);
  if (renaming && existing) renameWithRetry(existing, finalPath);
  let same = false;
  if (renaming) {
    try {
      same = noteText(fs.readFileSync(finalPath)) === body;
    } catch {}
  }
  if (!same) writeFileAtomic(finalPath, body);
  const real = path.join(path.dirname(finalPath), realBasename(finalPath));
  record(note.id, real, body);
  trace("M", "write-outside-note", real, `${body.length}b`);
  return { filePath: real, title: path.basename(real, ".md") };
}

export function registerOutsideNoteIPC(getMainWindow: () => BrowserWindow | null) {
  window = getMainWindow;
  ipcMain.handle("open-outside-note", (_event, filePath: unknown) =>
    typeof filePath === "string" ? openOutsideNote(filePath) : { error: "missing" },
  );
  ipcMain.handle("write-outside-note", (_event, note: OutsideNote) => writeOutsideNote(note));
  ipcMain.handle("check-outside-notes", () => checkOutsideNotes());
  // The window let a gone note go: nothing of it is looked for again.
  ipcMain.handle("forget-outside-note", (_event, id: unknown) => {
    if (typeof id === "string") entries.delete(id);
  });
}
