import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { parseNoteFile, saveIndex } from "./noteFileManager.js";
import { trace, traceEnabled } from "./trace.js";

let watcher = null;

// The app drops only an event it can identify as the consequence of its own
// filesystem operation; nothing is dropped on the clock alone. Three claims,
// one per kind of own operation, each held until the event that explains it:
//
// - `ownBytes`: a hash of the app's last write to a path. A change or add
//   whose file holds exactly those bytes is an echo of that write, whenever
//   it arrives (macOS sends a second, metadata-only `change` 1.5–2.7s after a
//   write, past any window a timer could hold). The claim ends at the first
//   event that shows the file has left the app's hands: a change to other
//   bytes, or the file going away. From then on those same bytes are a real
//   change again (a revert in git or Obsidian, a Put Back from the Trash).
//   Until 2026-09-08 the claim was never dropped, so such a change was taken
//   for an echo and the next save wrote over it.
// - `ownUnlinks`: paths the app is removing itself (a Trash move, the old
//   path of a rename), each consumed by the one unlink it produces. Not a
//   timer: shell.trashItem() latency is OS-mediated and unbounded. The
//   timeout is only a leak guard for an unlink chokidar never delivers.
// - `ownTrees`: a directory the app is renaming or removing, which chokidar
//   reports as one event per entry underneath. The renderer already knows the
//   outcome from the IPC answer, so everything under the old and the new
//   directory is dropped for a short window; one that escapes re-reads what
//   is already true. This is the one clock-decided suppression left, and its
//   residue is an outside change under a folder inside that window of the
//   user's own rename or removal of it.
const ownBytes = new Map();
const hashOf = (text) => createHash("sha1").update(text).digest("hex");
const UNLINK_CLAIM_FALLBACK_MS = 60_000;
const ownUnlinks = new Map();
const TREE_CLAIM_MS = 1500;
const ownTrees = new Map();
// Trace only: when each path was last claimed, so an escaping echo can be timed.
const lastClaimAt = new Map();
// Directory add/unlink events are coalesced into one `folders-changed` so a
// folder pasted in Finder with twenty subfolders triggers one re-read.
const FOLDERS_CHANGED_DEBOUNCE_MS = 300;
let foldersChangedTimer = null;

/**
 * Start (or restart) the chokidar file watcher on the notes directory.
 * Sends `file-changed` / `file-deleted` events to the renderer.
 */
function startWatcher(getNotesDir, getMainWindow) {
  // A missing vault is not made here: see `getNotesDir` in settingsManager.
  const notesDir = getNotesDir();

  if (watcher) watcher.close();
  // Every claim belongs to the previous watch session; carried across a
  // restart, one could swallow a real outside event at the same path.
  for (const filePath of [...ownUnlinks.keys()]) releaseUnlinkClaim(filePath);
  for (const timer of ownTrees.values()) clearTimeout(timer);
  ownTrees.clear();
  ownBytes.clear();

  watcher = watch(notesDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    ignored: (filePath) => isIgnoredPath(notesDir, filePath),
  });

  if (traceEnabled) {
    watcher.on("all", (event, filePath) => {
      const claimed = lastClaimAt.get(filePath);
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
        ownBytes.has(filePath)
          ? "own-bytes-claimed"
          : ownUnlinks.has(filePath)
            ? "own-unlink-claimed"
            : isUnderOwnTree(filePath)
              ? "own-tree"
              : "unclaimed",
        claimed === undefined ? "never-claimed" : `${Date.now() - claimed}ms after claim`,
        stat,
      );
    });
  }

  const onWriteEvent = (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isOwnWriteEvent(filePath)) return;
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
  };
  watcher.on("change", onWriteEvent);
  watcher.on("add", onWriteEvent);

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (isOwnUnlinkEvent(filePath)) return;
    getMainWindow()?.webContents.send("file-deleted", { filePath });
  });

  // Folders are directories: one made or removed outside the app changes the
  // sidebar. The renderer re-reads the folder list; it carries no payload.
  const onDirEvent = (dirPath) => {
    if (isUnderOwnTree(dirPath)) return;
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
 * What the watcher never reports, judged on the path *inside* the vault:
 * dot-entries at any depth, the attachment store, and the pre-v0.5.0 in-vault
 * index. The vault root itself is never a match, so a vault that lives under
 * a dot-directory (`~/.notes`) is watched like any other; the old regex ran
 * on the absolute path, root included, and such a vault got no watcher and no
 * error. Mirrors the note walk's skip rule in `readAllNotes`.
 */
function isIgnoredPath(notesDir, filePath) {
  const rel = path.relative(notesDir, filePath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const segments = rel.split(/[/\\]/);
  return segments.some((s) => s.startsWith(".") || s === "attachments");
}

/**
 * Claim a write the app has just made: `body` is the text now on disk at
 * `filePath`. Every later change or add whose file still holds exactly these
 * bytes is that write's echo (see `isOwnWriteEvent`); the claim ends at the
 * first event showing anything else there.
 */
function claimWrite(filePath, body) {
  ownBytes.set(filePath, hashOf(body));
  if (traceEnabled) {
    lastClaimAt.set(filePath, Date.now());
    trace("M", "claim write", path.basename(filePath), `${body.length}b`);
  }
}

/**
 * Claim the unlink the app is about to cause at `filePath` (a Trash move, the
 * old path of a rename). Consumed by that unlink when it arrives, or given
 * back with `releaseUnlinkClaim` when the operation fails and none is coming.
 * The file's bytes are no longer the app's either: whatever appears at the
 * path next is a real add, its bytes notwithstanding.
 */
function claimUnlink(filePath) {
  ownBytes.delete(filePath);
  releaseUnlinkClaim(filePath);
  if (traceEnabled) lastClaimAt.set(filePath, Date.now());
  const timer = setTimeout(() => ownUnlinks.delete(filePath), UNLINK_CLAIM_FALLBACK_MS);
  if (typeof timer.unref === "function") timer.unref();
  ownUnlinks.set(filePath, timer);
}

/** Give back an unlink claim. Returns true if one was pending. */
function releaseUnlinkClaim(filePath) {
  const timer = ownUnlinks.get(filePath);
  if (timer === undefined) return false;
  clearTimeout(timer);
  ownUnlinks.delete(filePath);
  return true;
}

/**
 * Claim every event under a directory the app is about to rename or remove,
 * the event for the directory itself included, for a short window. The
 * app's writes under it are no longer its own at those paths.
 */
function claimTree(dirPath) {
  for (const filePath of [...ownBytes.keys()]) {
    if (isUnder(filePath, dirPath)) ownBytes.delete(filePath);
  }
  clearTimeout(ownTrees.get(dirPath));
  ownTrees.set(
    dirPath,
    setTimeout(() => ownTrees.delete(dirPath), TREE_CLAIM_MS),
  );
}

function isUnder(filePath, dirPath) {
  return (
    filePath === dirPath ||
    filePath.startsWith(`${dirPath}/`) ||
    filePath.startsWith(`${dirPath}\\`)
  );
}

/** Whether a path is under a directory the app is renaming or removing. */
function isUnderOwnTree(filePath) {
  for (const dir of ownTrees.keys()) if (isUnder(filePath, dir)) return true;
  return false;
}

/**
 * What the claimed bytes say about a change to the file: `true` when it
 * still holds exactly the app's last write (an echo), `false` when it holds
 * something else (a real change), `null` when nothing is claimed for the
 * path or the file cannot be read, so the bytes cannot decide.
 */
function ownBytesVerdict(filePath) {
  const expected = ownBytes.get(filePath);
  if (expected === undefined) return null;
  let current;
  try {
    current = hashOf(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
  const echo = current === expected;
  if (traceEnabled)
    trace(
      "M",
      "echo-check",
      path.basename(filePath),
      echo ? "ECHO (own bytes, ignored)" : "differs → real change, claim dropped",
    );
  return echo;
}

/**
 * Whether a change or add event is the app's own write coming back, and so
 * must not reach the renderer. The bytes decide whenever a write is claimed
 * for the path: equal is an echo however late it arrives; different is a
 * real change however soon, and ends the claim, because the file now holds a
 * version the app did not write and a later return to its bytes is a change
 * too. A path with no claim is the app's only under a directory it is
 * renaming or removing.
 */
function isOwnWriteEvent(filePath) {
  const verdict = ownBytesVerdict(filePath);
  if (verdict === true) return true;
  if (verdict === false) {
    ownBytes.delete(filePath);
    return false;
  }
  return isUnderOwnTree(filePath);
}

/**
 * Whether an unlink is one the app caused: the one it claimed for the path,
 * or one under a directory it is renaming or removing. Any other unlink is
 * real, however soon after the app's own save of that file it lands; the
 * app's own writes never unlink the path they write. Either way the file is
 * gone, so the app's bytes are no longer at the path: whatever appears there
 * next, a Put Back from the Trash with the very same bytes included, is a
 * real add.
 */
function isOwnUnlinkEvent(filePath) {
  ownBytes.delete(filePath);
  if (releaseUnlinkClaim(filePath)) return true;
  return isUnderOwnTree(filePath);
}

/**
 * Close the file watcher (call on app quit).
 */
function closeWatcher() {
  return watcher ? watcher.close() : Promise.resolve();
}

export {
  isIgnoredPath,
  startWatcher,
  claimWrite,
  claimUnlink,
  releaseUnlinkClaim,
  claimTree,
  isUnderOwnTree,
  isOwnWriteEvent,
  isOwnUnlinkEvent,
  closeWatcher,
};
