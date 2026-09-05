import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getIdIndex, sanitizeFilename, saveIndex } from "./noteFileManager.js";

/**
 * Folders are directories.
 *
 * A folder in the sidebar is a real directory in the vault, the way Finder and
 * Obsidian treat it: every subdirectory shows (empty or not), New folder makes
 * the directory at once, and rename or move is one directory rename that
 * carries every file with it, notes and otherwise. Each operation answers with
 * the vault-relative path the disk actually holds, the same shape as
 * `write-note` answering with the basename a note got; nothing in the UI
 * second-guesses filename rules.
 *
 * Paths cross IPC as vault-relative POSIX paths (`Uni/Semester 1`), whatever
 * the OS separator, because the renderer joins and splits them on `/`.
 */

/** Suppress watcher events under a directory we are about to rename or remove. */
export interface FolderWatcherGuard {
  suppressTree: (dirPath: string) => void;
}

const NO_GUARD: FolderWatcherGuard = { suppressTree: () => {} };

/** Directories the vault walk never shows: hidden ones and the attachment store. */
function isSkippedDir(name: string): boolean {
  return name.startsWith(".") || name === "attachments";
}

/** Files a directory may hold and still count as empty. Only exact names; a
 * `._*` AppleDouble file could be a real user file and keeps the folder. */
function isDeletableOsCruft(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ".ds_store" || lower === "thumbs.db" || lower === "desktop.ini";
}

export const toPosix = (rel: string): string => rel.split(path.sep).join("/");

/**
 * Every directory under the vault that can hold notes, as sorted
 * vault-relative POSIX paths. Dot-directories and `attachments` are skipped
 * at any depth, matching the note walk.
 */
export function readAllFolders(notesDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(notesDir)) return out;
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || isSkippedDir(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(childRel);
      walk(path.join(dir, entry.name), childRel);
    }
  };
  walk(notesDir, "");
  return out.sort();
}

/**
 * The absolute path of a vault-relative folder, or null when the path is
 * malformed or would escape the vault. The vault root itself is not a folder.
 */
export function resolveVaultDir(notesDir: string, rel: string): string | null {
  if (typeof rel !== "string" || rel === "") return null;
  const parts = rel.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  const root = path.resolve(notesDir);
  const abs = path.resolve(root, ...parts);
  if (abs === root || !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function isDirectory(abs: string): boolean {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** Whether two paths name the same directory entry (false if either is missing). */
function isSameEntry(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.ino === sb.ino && sa.dev === sb.dev;
  } catch {
    return false;
  }
}

/** The first free `name`, `name-2`, `name-3`, … ; `ownPath` counts as free. */
function ensureUniqueDirPath(dirPath: string, ownPath: string | null = null): string {
  if (dirPath === ownPath || !fs.existsSync(dirPath)) return dirPath;
  for (let i = 2; ; i++) {
    const candidate = `${dirPath}-${i}`;
    if (candidate === ownPath || !fs.existsSync(candidate)) return candidate;
  }
}

/** The name the volume records for a directory entry (case, normalisation). */
function realRelPath(notesDir: string, abs: string): string {
  let name = path.basename(abs);
  try {
    name = path.basename(fs.realpathSync.native(abs));
  } catch {
    /* fall back to the requested name */
  }
  return toPosix(path.relative(notesDir, path.join(path.dirname(abs), name)));
}

/** Split a requested path into an existing parent (absolute) and a sanitised last segment. */
function splitTarget(notesDir: string, rel: string): { parentAbs: string; name: string } {
  if (typeof rel !== "string") throw new Error("Folder path must be a string");
  const parts = rel.split("/");
  const name = sanitizeFilename(parts.pop() ?? "");
  const parentRel = parts.join("/");
  const parentAbs = parentRel ? resolveVaultDir(notesDir, parentRel) : path.resolve(notesDir);
  if (!parentAbs || !isDirectory(parentAbs)) throw new Error("The parent folder does not exist");
  return { parentAbs, name };
}

/**
 * Create a directory. The last segment is sanitised and de-duplicated the way
 * a note's filename is; the parent must already exist. Answers with the
 * vault-relative path the directory got.
 */
export function createFolder(notesDir: string, requestedRel: string): { path: string } {
  const { parentAbs, name } = splitTarget(notesDir, requestedRel);
  const finalAbs = ensureUniqueDirPath(path.join(parentAbs, name));
  fs.mkdirSync(finalAbs);
  return { path: realRelPath(notesDir, finalAbs) };
}

/**
 * Rename or move a directory as one operation, so every file in it travels
 * together, notes and otherwise. `newRel` is the full requested path: a new
 * name in the same parent renames, a new parent moves. A folder can never be
 * moved into itself. The note index is rewritten for every note under the old
 * path so IDs survive the move. Answers with the path the disk holds.
 */
export function renameFolder(
  notesDir: string,
  oldRel: string,
  newRel: string,
  guard: FolderWatcherGuard = NO_GUARD,
): { path: string } {
  const oldAbs = resolveVaultDir(notesDir, oldRel);
  if (!oldAbs || !isDirectory(oldAbs)) throw new Error("The folder does not exist");
  const { parentAbs, name } = splitTarget(notesDir, newRel);
  const targetAbs = path.join(parentAbs, name);
  if (targetAbs === oldAbs) return { path: realRelPath(notesDir, oldAbs) };
  if (targetAbs.startsWith(oldAbs + path.sep))
    throw new Error("A folder cannot be moved into itself");

  // A case-only rename on a case-insensitive volume: the target "exists"
  // because it is the same entry, and rename is the way to change its casing.
  const sameEntry = fs.existsSync(targetAbs) && isSameEntry(oldAbs, targetAbs);
  const finalAbs = sameEntry ? targetAbs : ensureUniqueDirPath(targetAbs);

  guard.suppressTree(oldAbs);
  guard.suppressTree(finalAbs);
  fs.renameSync(oldAbs, finalAbs);

  const idIndex = getIdIndex();
  const oldPrefix = path.relative(notesDir, oldAbs) + path.sep;
  const newPrefix = path.relative(notesDir, finalAbs) + path.sep;
  for (const [id, rel] of Object.entries(idIndex)) {
    if (rel.startsWith(oldPrefix)) idIndex[id] = newPrefix + rel.slice(oldPrefix.length);
  }
  saveIndex(notesDir);

  return { path: realRelPath(notesDir, finalAbs) };
}

/** True when a directory holds nothing but OS cruft and directories that are themselves empty. */
function isEffectivelyEmpty(abs: string): boolean {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!isEffectivelyEmpty(path.join(abs, entry.name))) return false;
    } else if (!isDeletableOsCruft(entry.name)) {
      return false;
    }
  }
  return true;
}

/**
 * Remove a directory only if nothing is left in it (OS cruft such as
 * `.DS_Store` does not count). The notes it held have already gone to the
 * Trash by the time this runs; a file that is not a note keeps the folder on
 * disk, and the answer says so. A directory that is already gone counts as
 * removed.
 */
export function deleteFolderIfEmpty(
  notesDir: string,
  rel: string,
  guard: FolderWatcherGuard = NO_GUARD,
): { removed: boolean } {
  const abs = resolveVaultDir(notesDir, rel);
  if (!abs) throw new Error("The folder path is not inside the vault");
  if (!isDirectory(abs)) return { removed: true };
  if (!isEffectivelyEmpty(abs)) return { removed: false };
  guard.suppressTree(abs);
  fs.rmSync(abs, { recursive: true, force: true });
  return { removed: true };
}

export function registerFolderIPC(getNotesDir: () => string, guard: FolderWatcherGuard) {
  ipcMain.handle("read-folders", () => readAllFolders(getNotesDir()));
  ipcMain.handle("create-folder", (_event, rel: string) => createFolder(getNotesDir(), rel));
  ipcMain.handle("rename-folder", (_event, oldRel: string, newRel: string) =>
    renameFolder(getNotesDir(), oldRel, newRel, guard),
  );
  ipcMain.handle("delete-folder", (_event, rel: string) =>
    deleteFolderIfEmpty(getNotesDir(), rel, guard),
  );
}
