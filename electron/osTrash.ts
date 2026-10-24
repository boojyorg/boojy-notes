import { noteDeleted } from "./history.js";
import { ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getIdIndex, insideVault, saveIndex } from "./noteFileManager.js";

type TrashItem = (filePath: string) => Promise<void>;

/**
 * Watcher coordination around our own trash moves. `suppressUnlink` must hold
 * until the resulting unlink event is consumed (not a fixed timer — the OS
 * trash call's latency is unbounded); `releaseUnlink` undoes it when the trash
 * operation fails and no unlink is coming; `unlinkDone` settles it when the
 * move has finished, so a Put Back is seen whenever it comes.
 */
export interface WatcherGuard {
  suppressUnlink: (filePath: string) => void;
  releaseUnlink: (filePath: string) => void;
  unlinkDone: (filePath: string) => void;
}

/**
 * Move one indexed Markdown note to the platform Trash/Recycle Bin.
 *
 * `missing: true` means there was never a file to trash (the note was deleted
 * before its first disk write, or the indexed file is already gone) — a benign
 * no-op the renderer must not report as a failure.
 */
export async function trashManagedNote(
  notesDir: string,
  noteId: string,
  watcherGuard: WatcherGuard,
  trashItem: TrashItem = (filePath) => shell.trashItem(filePath),
): Promise<{ trashed: boolean; missing?: boolean }> {
  const idIndex = getIdIndex();
  const relativePath = idIndex[noteId];
  if (!relativePath) return { trashed: false, missing: true };

  const filePath = insideVault(notesDir, relativePath);
  if (!filePath) return { trashed: false };
  if (path.extname(filePath).toLowerCase() !== ".md") {
    return { trashed: false };
  }
  if (!fs.existsSync(filePath)) {
    // Stale index entry for a file already gone — heal it and report benign.
    delete idIndex[noteId];
    saveIndex(notesDir);
    return { trashed: false, missing: true };
  }

  watcherGuard.suppressUnlink(filePath);
  try {
    await trashItem(filePath);
  } catch (error) {
    // No unlink event is coming; leave the watcher able to see a real one.
    watcherGuard.releaseUnlink(filePath);
    throw error;
  }
  watcherGuard.unlinkDone(filePath);

  noteDeleted(noteId, relativePath.split(path.sep).join("/"));
  delete idIndex[noteId];
  try {
    saveIndex(notesDir);
  } catch (error) {
    // The file is already safely in the OS Trash. A later vault scan will
    // clean this stale in-memory/index entry, so do not report the trash move as failed.
    console.error("Failed to persist the note index after OS trash", error);
  }

  return { trashed: true };
}

/**
 * A file that is not a note (a PDF, an attachment) to the OS Trash, by its
 * vault-relative path. A note is refused: it goes by id through
 * `trashManagedNote`, which keeps the index and the watcher's claim. The
 * watcher forwards nothing for these files, so there is nothing to claim.
 */
export async function trashOtherFile(
  notesDir: string,
  rel: string,
  trashItem: (fullPath: string) => Promise<void> = shell.trashItem,
): Promise<{ trashed: boolean }> {
  const abs = insideVault(notesDir, rel);
  if (!abs || abs === path.resolve(notesDir)) return { trashed: false };
  const segments = path.relative(notesDir, abs).split(path.sep);
  const inAttachments = segments.slice(0, -1).includes("attachments");
  if (abs.endsWith(".md") && !inAttachments) return { trashed: false };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { trashed: false };
  await trashItem(abs);
  return { trashed: true };
}

export function registerOSTrashIPC(getNotesDir: () => string, watcherGuard: WatcherGuard) {
  ipcMain.handle("trash-note", (_event, noteId: string) =>
    trashManagedNote(getNotesDir(), noteId, watcherGuard),
  );
  ipcMain.handle("trash-file", (_event, rel: string) => trashOtherFile(getNotesDir(), rel));
}
