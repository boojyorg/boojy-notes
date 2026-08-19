import fs from "node:fs";
import { watch } from "chokidar";
import { parseNoteFile, saveIndex } from "./noteFileManager.js";

let watcher = null;
const ignoredPaths = new Set();
// Unlink suppression is consumed by the event itself, not a fixed timer:
// shell.trashItem() latency is OS-mediated and unbounded (cloud sync, AV
// scans), so a timer that expires before the unlink arrives would let our own
// delete masquerade as an external one. The timeout is only a leak guard for
// an unlink chokidar never delivers — by then the event is long stale.
const UNLINK_SUPPRESS_FALLBACK_MS = 60_000;
const ignoredUnlinks = new Map();

/**
 * Start (or restart) the chokidar file watcher on the notes directory.
 * Sends `file-changed` / `file-deleted` events to the renderer.
 */
function startWatcher(getNotesDir, getMainWindow) {
  const notesDir = getNotesDir();
  fs.mkdirSync(notesDir, { recursive: true });

  if (watcher) watcher.close();

  watcher = watch(notesDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    ignored: [/(^|[/\\])\./, /\.boojy-index\.json$/, /[/\\]attachments[/\\]/],
  });

  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (ignoredPaths.has(filePath)) return;
    const notesDir = getNotesDir();
    const note = parseNoteFile(filePath, notesDir);
    if (note && getMainWindow()) {
      saveIndex(notesDir);
      getMainWindow().webContents.send("file-changed", note);
    }
  });

  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (ignoredPaths.has(filePath)) return;
    const notesDir = getNotesDir();
    const note = parseNoteFile(filePath, notesDir);
    if (note && getMainWindow()) {
      saveIndex(notesDir);
      getMainWindow().webContents.send("file-changed", note);
    }
  });

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (releaseUnlinkSuppression(filePath)) return;
    if (ignoredPaths.has(filePath)) return;
    getMainWindow()?.webContents.send("file-deleted", { filePath });
  });
}

/**
 * Temporarily suppress watcher events for a given file path (e.g. after a write).
 */
function suppressWatcher(filePath) {
  ignoredPaths.add(filePath);
  setTimeout(() => ignoredPaths.delete(filePath), 1500);
}

/**
 * Suppress the next `unlink` event for a file we are about to trash ourselves.
 * Cleared by the event's arrival (or releaseUnlinkSuppression on failure), so
 * it holds however long the OS trash operation takes.
 */
function suppressNextUnlink(filePath) {
  releaseUnlinkSuppression(filePath);
  const timer = setTimeout(() => ignoredUnlinks.delete(filePath), UNLINK_SUPPRESS_FALLBACK_MS);
  if (typeof timer.unref === "function") timer.unref();
  ignoredUnlinks.set(filePath, timer);
}

/** Remove a pending unlink suppression. Returns true if one was consumed. */
function releaseUnlinkSuppression(filePath) {
  const timer = ignoredUnlinks.get(filePath);
  if (timer === undefined) return false;
  clearTimeout(timer);
  ignoredUnlinks.delete(filePath);
  return true;
}

/**
 * Close the file watcher (call on app quit).
 */
function closeWatcher() {
  if (watcher) watcher.close();
}

export {
  startWatcher,
  suppressWatcher,
  suppressNextUnlink,
  releaseUnlinkSuppression,
  closeWatcher,
};
