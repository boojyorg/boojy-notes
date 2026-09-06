import { app, ipcMain, dialog, shell, clipboard, nativeImage } from "electron";
import { trace } from "./trace.js";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
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

function noteToFilePath(note, notesDir) {
  const sanitized = sanitizeFilename(note.title || "Untitled") + ".md";
  if (note.folder) {
    const folderParts = note.folder.split("/").map(sanitizeFilename);
    return path.join(notesDir, ...folderParts, sanitized);
  }
  return path.join(notesDir, sanitized);
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

/**
 * Crash-safe write: write to a temp file, fsync it, then rename over the
 * target. Rename is atomic on the same volume, so a crash mid-write leaves the
 * previous file intact instead of a truncated one. The fsync before the rename
 * matters for power loss: without it the rename can hit the journal while the
 * data is still only in the page cache, leaving the target pointing at zeroed
 * blocks. The dot-prefix keeps the temp file invisible to the chokidar watcher
 * and the vault walk.
 */
function writeFileAtomic(filePath, data) {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeSync(fd, data, null, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
  // Persist the directory entry too, so the rename itself survives power loss.
  // Best-effort: Windows cannot fsync a directory handle opened this way.
  try {
    const dirFd = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    /* directory fsync unsupported on this platform */
  }
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

function registerNoteFileIPC(getMainWindow, getNotesDir, suppressWatcher) {
  ipcMain.handle("get-notes-dir", () => getNotesDir());

  ipcMain.handle("read-all-notes", () => {
    const notesDir = getNotesDir();
    fs.mkdirSync(notesDir, { recursive: true });
    return readAllNotes(notesDir);
  });

  // Writes the note and answers with the path and basename the file actually
  // got. The requested title may not survive the filesystem — a namesake
  // forces a `-2` suffix, characters a filename cannot hold become `_`, edges
  // are trimmed, a blank name becomes `Untitled` — and the renderer adopts the
  // returned `title` so what the user sees is what a restart will read. This
  // handler is the one place that knows the final name; nothing in the UI
  // second-guesses it.
  ipcMain.handle("write-note", (_event, note) => {
    const notesDir = getNotesDir();
    const targetPath = noteToFilePath(note, notesDir);
    const traceStart = Date.now();
    trace(
      "M",
      "write-note start",
      path.relative(notesDir, targetPath),
      "blocks",
      note.content?.blocks?.length ?? 0,
    );

    // Check if this note already exists at a different path (title/folder rename)
    const existingRelPath = _idIndex[note.id];
    const existingPath = existingRelPath ? path.join(notesDir, existingRelPath) : null;

    const { finalPath, sameFile } = resolveWritePath(targetPath, existingPath);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });

    // A case-only rename of the note's own file: move the directory entry
    // first, so the new casing is what the volume records (writing over the
    // old entry would keep its name), and skip the old-file removal below,
    // which would delete the file just written.
    if (sameFile) {
      suppressWatcher(existingPath);
      fs.renameSync(existingPath, finalPath);
    }

    // Serialize — just markdown body, no frontmatter; restore the file's
    // original line-ending style (content.eol is set by parseNoteFile)
    const bodyMd = applyEol(blocksToMarkdown(note.content?.blocks || []), note.content?.eol);

    suppressWatcher(finalPath, bodyMd);
    writeFileAtomic(finalPath, bodyMd);

    // On rename, remove the old file only after the new one is safely on disk —
    // a crash in between leaves a duplicate (recoverable), never a missing note
    if (existingPath && existingPath !== finalPath && !sameFile) {
      suppressWatcher(existingPath);
      try {
        fs.unlinkSync(existingPath);
        // Clean empty parent dirs
        const oldDir = path.dirname(existingPath);
        if (oldDir !== notesDir) {
          try {
            const entries = fs.readdirSync(oldDir);
            if (entries.length === 0) fs.rmdirSync(oldDir);
          } catch {
            // dir not empty or already removed
          }
        }
      } catch {
        // old file already gone
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
    const candidates = [
      path.join(notesDir, "attachments", filename),
      path.join(notesDir, filename),
    ];
    const legacyAttDir = path.join(notesDir, ".attachments");
    if (fs.existsSync(legacyAttDir)) {
      try {
        for (const sub of fs.readdirSync(legacyAttDir, { withFileTypes: true })) {
          if (sub.isDirectory()) {
            candidates.push(path.join(legacyAttDir, sub.name, filename));
          }
        }
      } catch {
        /* ignore */
      }
    }
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  });

  ipcMain.handle("open-path", async (_event, absolutePath) => {
    if (typeof absolutePath === "string" && fs.existsSync(absolutePath)) {
      await shell.openPath(absolutePath);
    }
  });

  ipcMain.handle("show-item-in-folder", (_event, absolutePath) => {
    if (typeof absolutePath === "string" && fs.existsSync(absolutePath)) {
      shell.showItemInFolder(absolutePath);
    }
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
    const candidates = [
      path.join(notesDir, "attachments", filename),
      path.join(notesDir, filename),
    ];
    for (const candidate of candidates) {
      try {
        return fs.statSync(candidate).size;
      } catch {
        /* try next */
      }
    }
    return null;
  });

  ipcMain.handle("copy-image-to-clipboard", (_event, filename) => {
    const notesDir = getNotesDir();
    const absPath = path.join(notesDir, "attachments", filename);
    if (!fs.existsSync(absPath)) return false;
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
