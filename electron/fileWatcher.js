import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { parseNoteFile, saveIndex } from "./noteFileManager.js";
import { trace, traceEnabled } from "./trace.js";

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
// The timer alone is not enough: macOS delivers a second `change` for one
// write 1.5–2.7s later (measured 2026-09-05 from a trace of the daily driver),
// after any sane window, and the renderer then rebuilt the note from disk
// mid-typing. So each own write also records a hash of the bytes it wrote,
// and an event whose file still holds exactly those bytes is an echo whatever
// the clock says. An outside edit that leaves the same bytes is a no-op anyway.
const ownContentHash = new Map();
const hashOf = (text) => createHash("sha1").update(text).digest("hex");
// Trace only: when each path was last armed, so an escaping echo can be timed.
const lastSuppressAt = new Map();
// Unlink suppression is consumed by the event itself, not a fixed timer:
// shell.trashItem() latency is OS-mediated and unbounded (cloud sync, AV
// scans), so a timer that expires before the unlink arrives would let our own
// delete masquerade as an external one. The timeout is only a leak guard for
// an unlink chokidar never delivers — by then the event is long stale.
const UNLINK_SUPPRESS_FALLBACK_MS = 60_000;
const ignoredUnlinks = new Map();
// A folder rename or removal is one filesystem operation that chokidar reports
// as one event per file underneath. The renderer already knows the outcome
// from the IPC answer, so every event under the old and new directory is
// suppressed for the same window a write is; one that escapes (a huge folder
// still being scanned) is harmless, because it re-reads what is already true.
const ignoredTrees = new Map();
// Directory add/unlink events are coalesced into one `folders-changed` so a
// folder pasted in Finder with twenty subfolders triggers one re-read.
const FOLDERS_CHANGED_DEBOUNCE_MS = 300;
let foldersChangedTimer = null;

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

  if (traceEnabled) {
    watcher.on("all", (event, filePath) => {
      const armed = lastSuppressAt.get(filePath);
      let stat = "";
      try {
        const s = fs.statSync(filePath);
        stat = `mtime=${Math.round(s.mtimeMs)} ctime=${Math.round(s.ctimeMs)} size=${s.size}`;
      } catch {
        stat = "stat-failed";
      }
      trace(
        "M",
        "fs",
        event,
        path.relative(notesDir, filePath),
        isWriteSuppressed(filePath) ? "SUPPRESSED" : "PASS",
        armed === undefined ? "never-written-by-us" : `${Date.now() - armed}ms after own write`,
        stat,
      );
    });
  }

  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isWriteSuppressed(filePath)) return;
    if (isOwnEcho(filePath)) return;
    const notesDir = getNotesDir();
    const note = parseNoteFile(filePath, notesDir);
    if (note && getMainWindow()) {
      saveIndex(notesDir);
      trace(
        "M",
        "send file-changed",
        path.relative(notesDir, filePath),
        "blocks",
        note.content?.blocks?.length ?? 0,
      );
      getMainWindow().webContents.send("file-changed", note);
    }
  });

  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isWriteSuppressed(filePath)) return;
    if (isOwnEcho(filePath)) return;
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

  // Folders are directories: one made or removed outside the app changes the
  // sidebar. The renderer re-reads the folder list; it carries no payload.
  const onDirEvent = (dirPath) => {
    if (isWriteSuppressed(dirPath)) return;
    clearTimeout(foldersChangedTimer);
    foldersChangedTimer = setTimeout(() => {
      foldersChangedTimer = null;
      getMainWindow()?.webContents.send("folders-changed");
    }, FOLDERS_CHANGED_DEBOUNCE_MS);
  };
  watcher.on("addDir", onDirEvent);
  watcher.on("unlinkDir", onDirEvent);
}

/**
 * Suppress watcher events for a file we are about to write. Re-arming a path
 * that is already suppressed extends its window from now — it never shortens it.
 * With `body`, the bytes being written are remembered so a late echo is still
 * recognised after the window (see `isOwnEcho`).
 */
function suppressWatcher(filePath, body) {
  if (typeof body === "string") ownContentHash.set(filePath, hashOf(body));
  if (traceEnabled) {
    lastSuppressAt.set(filePath, Date.now());
    trace(
      "M",
      "suppress",
      path.basename(filePath),
      `${WRITE_SUPPRESS_MS}ms`,
      body === undefined ? "" : "+hash",
    );
  }
  clearTimeout(ignoredPaths.get(filePath));
  ignoredPaths.set(
    filePath,
    setTimeout(() => ignoredPaths.delete(filePath), WRITE_SUPPRESS_MS),
  );
}

/**
 * Suppress every event under a directory we are about to rename or remove,
 * including the event for the directory itself. Same window as a write.
 */
function suppressWatcherTree(dirPath) {
  clearTimeout(ignoredTrees.get(dirPath));
  ignoredTrees.set(
    dirPath,
    setTimeout(() => ignoredTrees.delete(dirPath), WRITE_SUPPRESS_MS),
  );
}

/** Whether the file holds exactly the bytes of our last write to it: a late echo, not an edit. */
function isOwnEcho(filePath) {
  const expected = ownContentHash.get(filePath);
  if (expected === undefined) return false;
  let current;
  try {
    current = hashOf(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return false;
  }
  const echo = current === expected;
  if (traceEnabled)
    trace(
      "M",
      "echo-check",
      path.basename(filePath),
      echo ? "ECHO (own bytes, ignored)" : "differs → real change",
    );
  return echo;
}

/** Whether a path is inside its own-write suppression window, or under a suppressed tree. */
function isWriteSuppressed(filePath) {
  if (ignoredPaths.has(filePath)) return true;
  for (const dir of ignoredTrees.keys()) {
    if (filePath === dir || filePath.startsWith(`${dir}/`) || filePath.startsWith(`${dir}\\`))
      return true;
  }
  return false;
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
  suppressWatcherTree,
  isWriteSuppressed,
  isOwnEcho,
  suppressNextUnlink,
  releaseUnlinkSuppression,
  closeWatcher,
};
