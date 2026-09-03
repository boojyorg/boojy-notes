import fs from "node:fs";
import { watch } from "chokidar";
import { parseNoteFile, saveIndex } from "./noteFileManager.js";

let watcher = null;
// Our own writes echo back through chokidar ~350ms later (awaitWriteFinish).
// Each write is suppressed for a window measured from the LATEST write to
// that path: one timer per path, reset on every write. The old version kept
// one timer per WRITE on a shared Set, so the first write's timer expired and
// un-suppressed a path a later write still depended on — any two saves
// 1.15–1.5s apart let the second echo through, and the renderer then rebuilt
// the note from disk (caret to the top, keystrokes since the write lost).
const WRITE_SUPPRESS_MS = 1500;
const ignoredPaths = new Map();
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
  // Pending suppressions belong to the previous watch session; carrying one
  // across a restart could swallow a real external delete at the same path.
  for (const filePath of [...ignoredUnlinks.keys()]) releaseUnlinkSuppression(filePath);

  watcher = watch(notesDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    ignored: [/(^|[/\\])\./, /\.boojy-index\.json$/, /[/\\]attachments[/\\]/],
  });

  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isWriteSuppressed(filePath)) return;
    const notesDir = getNotesDir();
    const note = parseNoteFile(filePath, notesDir);
    if (note && getMainWindow()) {
      saveIndex(notesDir);
      getMainWindow().webContents.send("file-changed", note);
    }
  });

  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isWriteSuppressed(filePath)) return;
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
    if (isWriteSuppressed(filePath)) return;
    getMainWindow()?.webContents.send("file-deleted", { filePath });
  });
}

/**
 * Suppress watcher events for a file we are about to write. Re-arming a path
 * that is already suppressed extends its window from now — it never shortens it.
 */
function suppressWatcher(filePath) {
  clearTimeout(ignoredPaths.get(filePath));
  ignoredPaths.set(
    filePath,
    setTimeout(() => ignoredPaths.delete(filePath), WRITE_SUPPRESS_MS),
  );
}

/** Whether a path is inside its own-write suppression window. */
function isWriteSuppressed(filePath) {
  return ignoredPaths.has(filePath);
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
  isWriteSuppressed,
  suppressNextUnlink,
  releaseUnlinkSuppression,
  closeWatcher,
};
