import { app, ipcMain, dialog, shell, clipboard, nativeImage } from "electron";
import { trace } from "./trace.js";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { writeFileAtomic } from "./atomicWrite.js";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
  parseFrontmatter,
} from "../src/utils/markdown.js";

// ─── Filename helpers ───

/**
 * The one place a name the app creates is made safe for the vault. Invalid
 * characters become `_`, the edges are trimmed, a blank name is `Untitled`,
 * and a leading dot becomes `_`: the vault walk, the folder walk and the
 * watcher all skip dot-entries, so `.env.md` or a `.archive/` directory was
 * written fine and then vanished at the next restart, notes and all. The
 * same rule covers `.` and `..`, so no name can be a traversal component.
 */
function sanitizeFilename(name) {
  let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
  if (sanitized.startsWith(".")) sanitized = `_${sanitized.slice(1)}`;
  return sanitized;
}

/**
 * Where a note's file goes: the directory its `folder` names and a basename
 * from its title. A name the app makes is sanitised; a name the disk already
 * holds is kept as read. The folder is always a name the disk holds (the
 * renderer only ever has one from the folder walk or from a folder operation's
 * answer), so it is checked to lie inside the vault and never rewritten: a
 * Finder-made `Work: Client` is the directory the note goes in, not a
 * sanitised twin beside it. The title is the note's own file's basename when
 * it still reads so (`existingRelPath`, the index entry): `Why?.md` stays
 * `Why?.md` on every save. Any other title is one the user typed, and is
 * sanitised.
 */
function noteToFilePath(note, notesDir, existingRelPath = null) {
  const dir = note.folder ? insideVault(notesDir, note.folder) : path.resolve(notesDir);
  if (!dir) throw new Error(`The folder is not inside the vault: ${note.folder}`);
  const ownName = existingRelPath ? path.basename(existingRelPath, ".md") : null;
  const name = note.title === ownName ? ownName : sanitizeFilename(note.title || "Untitled");
  return path.join(dir, `${name}.md`);
}

/**
 * The path a file may be written to without clobbering anything: `filePath`
 * itself if nothing is there, else the first free `name-2`, `name-3`, …
 *
 * `ownPath` is the file this write already owns (a note's current path). It
 * counts as free: a note that resolved to `Meeting notes-2.md` last time, and
 * whose requested name is still taken by its namesake, lands on `-2` again
 * rather than being treated as a collision with itself and bounced to `-3`
 * (and back to `-2` on the save after, forever). Every other file on disk is
 * a collision, whether or not the ID index knows it — an unindexed file, or a
 * case-variant on a case-insensitive volume, must never be overwritten.
 */
function ensureUniqueFilePath(filePath, ownPath = null) {
  if (filePath === ownPath || !fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  for (let i = 2; ; i++) {
    const candidate = path.join(dir, `${base}-${i}${ext}`);
    if (candidate === ownPath || !fs.existsSync(candidate)) return candidate;
  }
}

/** Whether two paths name the same file on disk (false if either is missing). */
function isSameFile(a, b) {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.ino === sb.ino && sa.dev === sb.dev;
  } catch {
    return false;
  }
}

/**
 * The name the directory entry actually carries, which on a case-insensitive
 * or normalising volume can differ from the name that was asked for. Falls
 * back to the requested basename if the volume can't answer.
 */
function realBasename(filePath) {
  try {
    return path.basename(fs.realpathSync.native(filePath));
  } catch {
    return path.basename(filePath);
  }
}

/**
 * The absolute path `candidate` names if it lies in the vault (the root
 * itself included), else null. Every IPC handler that takes a path from the
 * renderer goes through this: a note's file block can name any path, and the
 * handlers hand paths to `shell`, the clipboard and `stat`. Lexical, like the
 * `boojy-att` protocol's check; a symlink inside the vault is the user's own.
 */
function insideVault(notesDir, candidate) {
  if (typeof candidate !== "string" || candidate === "") return null;
  const root = path.resolve(notesDir);
  const abs = path.resolve(root, candidate);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

/**
 * A vault that is not there is not recreated. The default vault is made by
 * `getNotesDir` the first time it is asked for; a vault the user chose that
 * is missing (an unmounted volume, a folder moved in Finder) must not come
 * back as an empty directory on the boot disk with new notes quietly going
 * into it. A write refuses instead, and the renderer's save toast says so.
 */
function assertVaultPresent(notesDir) {
  if (!fs.existsSync(notesDir)) throw new Error(`The notes folder is missing: ${notesDir}`);
}

/**
 * Where a note's file goes on this write, and whether the write is a rename
 * of the note's own file to a name the volume considers the same (a
 * case-only or Unicode-normalisation change). Pure decision; no writes.
 */
function resolveWritePath(targetPath, existingPath) {
  if (existingPath === targetPath) return { finalPath: targetPath, sameFile: false };
  if (existingPath && fs.existsSync(targetPath) && isSameFile(existingPath, targetPath))
    return { finalPath: targetPath, sameFile: true };
  return { finalPath: ensureUniqueFilePath(targetPath, existingPath), sameFile: false };
}

// ─── Note ID index ───
// Lives in Electron userData (one file per vault, keyed by vault path), NOT in
// the vault itself: opening a third-party folder must never write into it.
// Cost of the location: moving a vault to another machine regenerates IDs.

let _idIndex = {}; // noteId → relative path
let _savedIndexJson = null; // serialized state already on disk — skip no-op saves
let _indexDirOverride = null; // tests inject a temp dir (no `app` in vitest)

function setIndexDir(dir) {
  _indexDirOverride = dir;
  _savedIndexJson = null;
}

function indexDir() {
  return _indexDirOverride || path.join(app.getPath("userData"), "note-indexes");
}

function indexPath(notesDir) {
  const hash = crypto.createHash("sha1").update(path.resolve(notesDir)).digest("hex");
  return path.join(indexDir(), `${hash.slice(0, 12)}.json`);
}

function legacyIndexPath(notesDir) {
  return path.join(notesDir, ".boojy-index.json");
}

function loadIndex(notesDir) {
  _savedIndexJson = null;
  try {
    const raw = fs.readFileSync(indexPath(notesDir), "utf-8");
    _idIndex = JSON.parse(raw);
    _savedIndexJson = raw;
  } catch {
    _idIndex = {};
    // Migrate a pre-v0.5.0 in-vault index, then remove it — it is Boojy's own
    // file, and leaving it would keep the vault dirty for git-tracked folders
    try {
      _idIndex = JSON.parse(fs.readFileSync(legacyIndexPath(notesDir), "utf-8"));
      saveIndex(notesDir);
      try {
        fs.unlinkSync(legacyIndexPath(notesDir));
      } catch {
        /* leave the legacy copy if it can't be removed */
      }
    } catch {
      /* no index anywhere — fresh vault */
    }
  }
  return _idIndex;
}

function saveIndex(notesDir) {
  const json = JSON.stringify(_idIndex, null, 2);
  if (json === _savedIndexJson) return;
  fs.mkdirSync(indexDir(), { recursive: true });
  writeFileAtomic(indexPath(notesDir), json);
  _savedIndexJson = json;
}

/** Returns the current ID index (mutable reference). */
function getIdIndex() {
  return _idIndex;
}

// ─── Parse a single note file ───

function parseNoteFile(filePath, notesDir) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(notesDir, filePath);
    const relDir = path.relative(notesDir, path.dirname(filePath));
    // `/`-separated on every OS: the renderer joins and splits folder paths on it.
    const folder = relDir ? relDir.split(path.sep).join("/") : null;
    const title = path.basename(filePath, ".md");

    let body = raw;
    let migratedId = null;

    // Legacy Boojy files carry a Boojy-shaped `id:` in frontmatter — strip it and
    // reuse the ID. Any other frontmatter is not ours and must stay in the body,
    // where it round-trips as a frontmatter block. Reading never modifies disk;
    // legacy files migrate only when the user edits them (normal write path).
    const fm = parseFrontmatter(raw);
    if (fm?.id && /^note-\d+-/.test(fm.id)) {
      migratedId = fm.id;
      body = fm.body;
    }

    // Look up existing ID from index, or use migrated ID, or generate new
    let id = null;
    for (const [noteId, p] of Object.entries(_idIndex)) {
      if (p === relPath) {
        id = noteId;
        break;
      }
    }
    if (!id) id = migratedId || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Update index
    _idIndex[id] = relPath;

    const blocks = markdownToBlocks(body);

    // Remember a CRLF file's line-ending style so saves re-apply it
    // (write-note → applyEol). LF files carry no field.
    const eol = detectEol(raw);
    const content = { title, blocks };
    if (eol === "\r\n") content.eol = eol;

    return {
      id,
      title,
      folder,
      content,
      // File mtime, which is what makes "Most recent" mean anything on a vault
      // whose notes all predate Boojy's own last-opened timestamps — and what
      // lets an edit made in another app count as recent activity. Declared in
      // types/notes.ts and read by search.js as a tiebreak since long before
      // anything populated it. One extra stat on a file already being read.
      lastModified: Math.round(fs.statSync(filePath).mtimeMs),
      _filePath: filePath,
    };
  } catch {
    return null;
  }
}

// ─── Read all notes from vault ───

function readAllNotes(notesDir) {
  const notes = {};
  if (!fs.existsSync(notesDir)) return notes;

  loadIndex(notesDir);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "attachments") continue;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".md")) {
        const filePath = path.join(dir, entry.name);
        const note = parseNoteFile(filePath, notesDir);
        if (note) notes[note.id] = note;
      }
    }
  }

  walk(notesDir);

  // Clean stale index entries
  for (const [id, relPath] of Object.entries(_idIndex)) {
    if (!fs.existsSync(path.join(notesDir, relPath))) delete _idIndex[id];
  }

  saveIndex(notesDir);
  return notes;
}

// ─── Register IPC handlers ───

/**
 * `watcher` tells the file watcher what this module does to the vault, so
 * the events those operations cause are recognised as the app's own:
 * `claimWrite(path, body)` after a write, `claimUnlink(path)` before an
 * unlink or rename-away the app makes (`releaseUnlinkClaim` when it fails).
 */
function registerNoteFileIPC(getMainWindow, getNotesDir, watcher) {
  ipcMain.handle("get-notes-dir", () => getNotesDir());

  ipcMain.handle("read-all-notes", () => readAllNotes(getNotesDir()));

  // Writes the note and answers with the path and basename the file actually
  // got. A requested title may not survive the filesystem — a namesake
  // forces a `-2` suffix, characters a filename cannot hold become `_`, edges
  // are trimmed, a blank name becomes `Untitled` — and the renderer adopts the
  // returned `title` so what the user sees is what a restart will read. A
  // name the disk already holds is never rewritten (`noteToFilePath`). This
  // handler is the one place that knows the final name; nothing in the UI
  // second-guesses it.
  ipcMain.handle("write-note", (_event, note) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    // The note's own file, if it has one (a title or folder change is a rename away from it).
    const existingRelPath = _idIndex[note.id];
    const existingPath = existingRelPath ? path.join(notesDir, existingRelPath) : null;
    const targetPath = noteToFilePath(note, notesDir, existingRelPath);
    const traceStart = Date.now();
    trace(
      "M",
      "write-note start",
      path.relative(notesDir, targetPath),
      "blocks",
      note.content?.blocks?.length ?? 0,
    );

    const { finalPath, sameFile } = resolveWritePath(targetPath, existingPath);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });

    // A case-only rename of the note's own file: move the directory entry
    // first, so the new casing is what the volume records (writing over the
    // old entry would keep its name), and skip the old-file removal below,
    // which would delete the file just written. chokidar reports the move as
    // an unlink of the old name and an add of the new (probed 2026-09-08);
    // the add is the write's own echo, the unlink is claimed here.
    if (sameFile) {
      watcher.claimUnlink(existingPath);
      try {
        fs.renameSync(existingPath, finalPath);
      } catch (error) {
        watcher.releaseUnlinkClaim(existingPath);
        throw error;
      }
    }

    // Serialize — just markdown body, no frontmatter; restore the file's
    // original line-ending style (content.eol is set by parseNoteFile)
    const bodyMd = applyEol(blocksToMarkdown(note.content?.blocks || []), note.content?.eol);

    writeFileAtomic(finalPath, bodyMd);
    // Claimed after the write: a claim describes bytes that are on disk. The
    // handler is synchronous, so no watcher event can arrive in between.
    watcher.claimWrite(finalPath, bodyMd);

    // On rename, remove the old file only after the new one is safely on disk —
    // a crash in between leaves a duplicate (recoverable), never a missing note.
    // The directory it leaves stays, however empty: a folder is a directory
    // the user made, and only an explicit folder removal takes one away
    // (decision D8, 2026-09-07). Until then the emptied parent was removed
    // here, so moving the last note out of a folder deleted the folder.
    if (existingPath && existingPath !== finalPath && !sameFile) {
      watcher.claimUnlink(existingPath);
      try {
        fs.unlinkSync(existingPath);
      } catch {
        // Already gone, so no unlink of the app's is coming; a later one is real.
        watcher.releaseUnlinkClaim(existingPath);
      }
    }

    // Index and report the entry the volume actually holds. On disk the
    // basename is the note's title; `readAllNotes` reads it back as such.
    const realPath = path.join(path.dirname(finalPath), realBasename(finalPath));
    _idIndex[note.id] = path.relative(notesDir, realPath);
    saveIndex(notesDir);

    trace(
      "M",
      "write-note done",
      path.relative(notesDir, realPath),
      `${Date.now() - traceStart}ms`,
      `${bodyMd.length}b`,
    );
    return { filePath: realPath, title: path.basename(realPath, ".md") };
  });

  ipcMain.handle("save-image", (_event, { fileName, dataBase64 }) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const attDir = path.join(notesDir, "attachments");
    fs.mkdirSync(attDir, { recursive: true });
    const safeName =
      sanitizeFilename(path.parse(fileName).name) + path.extname(fileName).toLowerCase();
    const finalPath = ensureUniqueFilePath(path.join(attDir, safeName));
    fs.writeFileSync(finalPath, Buffer.from(dataBase64, "base64"));
    return path.basename(finalPath);
  });

  ipcMain.handle("save-attachment", (_event, { fileName, dataBase64 }) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const attDir = path.join(notesDir, "attachments");
    fs.mkdirSync(attDir, { recursive: true });
    const safeName =
      sanitizeFilename(path.parse(fileName).name) + path.extname(fileName).toLowerCase();
    const finalPath = ensureUniqueFilePath(path.join(attDir, safeName));
    fs.writeFileSync(finalPath, Buffer.from(dataBase64, "base64"));
    const size = fs.statSync(finalPath).size;
    return { filename: path.basename(finalPath), size };
  });

  ipcMain.handle("resolve-attachment", (_event, filename) => {
    const notesDir = getNotesDir();
    if (typeof filename !== "string") return null;
    const candidates = [path.join("attachments", filename), filename];
    const legacyAttDir = path.join(notesDir, ".attachments");
    if (fs.existsSync(legacyAttDir)) {
      try {
        for (const sub of fs.readdirSync(legacyAttDir, { withFileTypes: true })) {
          if (sub.isDirectory()) candidates.push(path.join(".attachments", sub.name, filename));
        }
      } catch {
        /* ignore */
      }
    }
    for (const candidate of candidates) {
      const abs = insideVault(notesDir, candidate);
      if (abs && fs.existsSync(abs)) return abs;
    }
    return null;
  });

  // The two `shell` handlers take absolute paths (a resolved attachment, a
  // note's file, the vault itself for Reveal in Finder) and open nothing
  // outside the vault.
  ipcMain.handle("open-path", async (_event, absolutePath) => {
    const abs = insideVault(getNotesDir(), absolutePath);
    if (abs && fs.existsSync(abs)) await shell.openPath(abs);
  });

  ipcMain.handle("show-item-in-folder", (_event, absolutePath) => {
    const abs = insideVault(getNotesDir(), absolutePath);
    if (abs && fs.existsSync(abs)) shell.showItemInFolder(abs);
  });

  ipcMain.handle("pick-file", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const size = fs.statSync(filePath).size;
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    if (size > MAX_FILE_SIZE) {
      dialog.showMessageBoxSync(getMainWindow(), {
        type: "warning",
        message: "File too large",
        detail: `The selected file is ${(size / 1024 / 1024).toFixed(0)} MB. Maximum allowed size is 100 MB.`,
      });
      return null;
    }
    const dataBase64 = fs.readFileSync(filePath).toString("base64");
    return { fileName: path.basename(filePath), dataBase64, size };
  });

  ipcMain.handle("get-file-size", (_event, filename) => {
    const notesDir = getNotesDir();
    if (typeof filename !== "string") return null;
    for (const candidate of [path.join("attachments", filename), filename]) {
      const abs = insideVault(notesDir, candidate);
      if (!abs) continue;
      try {
        return fs.statSync(abs).size;
      } catch {
        /* try next */
      }
    }
    return null;
  });

  ipcMain.handle("copy-image-to-clipboard", (_event, filename) => {
    const notesDir = getNotesDir();
    if (typeof filename !== "string") return false;
    const absPath = insideVault(notesDir, path.join("attachments", filename));
    if (!absPath || !fs.existsSync(absPath)) return false;
    try {
      const img = nativeImage.createFromPath(absPath);
      clipboard.writeImage(img);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("open-external", async (_event, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle("pick-image-file", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const dataBase64 = fs.readFileSync(filePath).toString("base64");
    return { fileName: path.basename(filePath), dataBase64 };
  });
}

export {
  writeFileAtomic,
  insideVault,
  sanitizeFilename,
  ensureUniqueFilePath,
  resolveWritePath,
  noteToFilePath,
  getIdIndex,
  setIndexDir,
  indexPath,
  loadIndex,
  saveIndex,
  parseNoteFile,
  readAllNotes,
  registerNoteFileIPC,
};
