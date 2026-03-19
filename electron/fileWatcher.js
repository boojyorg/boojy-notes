import fs from "node:fs";
import { watch } from "chokidar";
import { parseNoteFile, saveIndex } from "./noteFileManager.js";

let watcher = null;
const ignoredPaths = new Set();

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
 * Close the file watcher (call on app quit).
 */
function closeWatcher() {
  if (watcher) watcher.close();
}

export { startWatcher, suppressWatcher, closeWatcher };
