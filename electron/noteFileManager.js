import { app, ipcMain, dialog, shell, clipboard, ClipboardItem, nativeImage } from "electron";
import { trace } from "./trace.js";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { writeFileAtomic } from "./atomicWrite.js";
import * as history from "./history.js";
import { isOffloaded, offloadedAmong, readDownloading } from "./offloaded.js";
import { isSameEntry, isSkippedName, vaultKey } from "./vaultFs.js";
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
 * A Windows device name (`CON`, `nul.txt`) gets a `_` after it on every
 * system: a vault moves between machines, and Windows can hold no file or
 * folder by that name, whatever follows its first dot.
 */
function sanitizeFilename(name) {
  let sanitized = capBytes(name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")).trim() || "Untitled";
  if (sanitized.startsWith(".")) sanitized = `_${sanitized.slice(1)}`;
  const dot = sanitized.indexOf(".");
  const stem = (dot === -1 ? sanitized : sanitized.slice(0, dot)).trimEnd();
  if (WINDOWS_DEVICE.test(stem)) sanitized = `${stem}_${dot === -1 ? "" : sanitized.slice(dot)}`;
  return sanitized;
}

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)$/i;

/**
 * An attachment's file name: its name made safe as any name the app makes,
 * and its extension cut to what a file name can hold, lowercased and short.
 * A pasted `photo.P?NG` failed to save on Windows.
 */
function attachmentName(fileName) {
  const { name, ext } = path.parse(fileName.trim());
  const safeExt = ext
    .slice(1)
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1f\s.]/g, "")
    .slice(0, 16);
  return sanitizeFilename(name) + (safeExt ? `.${safeExt}` : "");
}

/**
 * The longest name the app makes, in UTF-8 bytes. A file name is at most 255
 * bytes on macOS, Windows and Linux alike; this leaves room for `.md`, a
 * collision suffix and a conflicted copy's ` (conflicted copy YYYY-MM-DD)`.
 * A longer title (a paragraph pasted into the name) takes the name cut here,
 * and the field adopts it, as it adopts any answer the write gives.
 */
const MAX_NAME_BYTES = 200;

/** `name` cut to MAX_NAME_BYTES of UTF-8, never inside a character. */
function capBytes(name) {
  if (Buffer.byteLength(name, "utf8") <= MAX_NAME_BYTES) return name;
  let out = "";
  let bytes = 0;
  for (const ch of name) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > MAX_NAME_BYTES) break;
    out += ch;
    bytes += size;
  }
  return out;
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

/**
 * The name the directory entry actually carries, which on a case-insensitive
 * or normalising volume can differ from the name that was asked for. Falls
 * back to the requested basename if the volume can't answer. A symlinked
 * note is named by its link, never by the file the link points to.
 */
function realBasename(filePath) {
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) return path.basename(filePath);
    return path.basename(fs.realpathSync.native(filePath));
  } catch {
    return path.basename(filePath);
  }
}

/**
 * The absolute path `candidate` names if it lies in the vault (the root
 * itself included), else null. Every IPC handler that takes a path from the
 * renderer goes through this: a note's file block can name any path, and the
 * handlers hand paths to `shell`, the clipboard and `stat`, and the `boojy-att`
 * protocol (`main.js`) serves attachments through it. Lexical; a symlink
 * inside the vault is the user's own.
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
  if (existingPath && fs.existsSync(targetPath) && isSameEntry(existingPath, targetPath))
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
// Where the last file or image was picked from. Since Electron 43 a dialog with
// no path opens in Downloads every time rather than where the user last was.
let _lastPickDir;

function setIndexDir(dir) {
  _indexDirOverride = dir;
  _savedIndexJson = null;
}

function indexDir() {
  return _indexDirOverride || path.join(app.getPath("userData"), "note-indexes");
}

function indexPath(notesDir) {
  return path.join(indexDir(), `${vaultKey(notesDir)}.json`);
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

// ─── A note's file across an outside rename ───
// The index maps an id to a path, and a rename made outside the app (Finder,
// `mv`, Obsidian) leaves that path empty; read as a delete, a note with
// pending edits would be written afresh under the old name beside the renamed
// one. The disk's own identity for a file is its inode:
// a rename or move within the volume keeps it, and nothing else in the vault
// has it. It is recorded here for every note the app reads or writes, with
// the hash of the bytes it read or wrote, in memory only: pending edits never
// outlive the session, so nothing needs to survive one. The record is
// consulted in exactly one place, `relocateNote`, when an indexed path is
// reported gone.
const _identity = new Map(); // id → { dev, ino, hash }
const hashOf = (text) => crypto.createHash("sha1").update(text).digest("hex");

function recordIdentity(id, stat, raw) {
  _identity.set(id, { dev: stat.dev, ino: stat.ino, hash: hashOf(raw) });
}

/**
 * Every note file under the vault, skipping what the vault walk skips. A
 * directory that cannot be listed is passed over: one folder the user cannot
 * open must not leave the whole vault unloaded.
 */
function walkNoteFiles(dir, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.warn("Folder could not be listed", dir, String(error));
    return;
  }
  for (const entry of entries) {
    if (isSkippedName(entry.name)) continue;
    if (entry.isDirectory()) walkNoteFiles(path.join(dir, entry.name), visit);
    else if (entry.name.endsWith(".md")) visit(path.join(dir, entry.name));
  }
}

/**
 * Where the note indexed at `filePath`, now reported gone, has moved to: the
 * file elsewhere in the vault that holds its inode. Null when the path is not
 * an indexed note's, the file is still there, or nothing in the vault holds
 * the inode (a real delete, or a move done as copy and delete, which the
 * caller treats as the delete it looks like). On a match the index follows,
 * and the note is parsed at its new path. `sameBytes` says whether the file
 * still holds exactly the bytes the app last read or wrote, so the watcher
 * can take the `add` the rename produces for the nothing-new it is. Another
 * note indexed at the new path (`mv -f` over it) has lost its file to this
 * one; its entry is dropped and its id returned as `displaced`.
 */
function relocateNote(filePath, notesDir) {
  const relPath = path.relative(notesDir, filePath);
  let id = null;
  for (const [noteId, p] of Object.entries(_idIndex)) {
    if (p === relPath) {
      id = noteId;
      break;
    }
  }
  const identity = id ? _identity.get(id) : undefined;
  if (!identity || fs.existsSync(filePath)) return null;

  let newPath = null;
  walkNoteFiles(notesDir, (candidate) => {
    if (newPath) return;
    try {
      const s = fs.statSync(candidate);
      if (s.dev === identity.dev && s.ino === identity.ino) newPath = candidate;
    } catch {
      /* gone between readdir and stat */
    }
  });
  if (!newPath) return null;

  const newRelPath = path.relative(notesDir, newPath);
  let displaced = null;
  for (const [other, p] of Object.entries(_idIndex)) {
    if (p === newRelPath && other !== id) {
      displaced = other;
      delete _idIndex[other];
      _identity.delete(other);
    }
  }
  // An offloaded file is not read (that would download it): its text is
  // whatever the app already holds, and the watcher leaves its add alone.
  const offloaded = isOffloaded(newPath);
  let raw = null;
  if (!offloaded) {
    try {
      raw = fs.readFileSync(newPath, "utf-8");
    } catch {
      return null;
    }
  }
  const sameBytes = offloaded || hashOf(raw) === identity.hash;
  _idIndex[id] = newRelPath;
  const note = parseNoteFile(newPath, notesDir, offloaded);
  if (!note) return null;
  saveIndex(notesDir);
  return { note, raw, sameBytes, displaced };
}

// ─── Parse a single note file ───

// While the vault loads: the history hash of each note whose indexed file is
// missing, so a file renamed while the app was closed keeps its id.
const _adoptable = new Map(); // hash → noteId

/** The id the index holds for a vault-relative path, or null. */
function indexedIdAt(relPath) {
  for (const [noteId, p] of Object.entries(_idIndex)) if (p === relPath) return noteId;
  return null;
}

/**
 * A note whose text is not on this Mac (`offloaded.ts`): listed by its name,
 * never read, marked `offloaded` so the renderer downloads it before showing
 * or saving it. Its history and identity bytes wait for that download.
 */
function offloadedNote(filePath, notesDir, stat) {
  const relPath = path.relative(notesDir, filePath);
  const relDir = path.relative(notesDir, path.dirname(filePath));
  const title = path.basename(filePath, ".md");
  const id = indexedIdAt(relPath) ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  _idIndex[id] = relPath;
  // Offloading keeps the bytes the app last saw, so a save still compares
  // against them (it downloads the file to do so); a note never read has none.
  _identity.set(id, { dev: stat.dev, ino: stat.ino, hash: _identity.get(id)?.hash ?? null });
  return {
    id,
    title,
    folder: relDir ? relDir.split(path.sep).join("/") : null,
    content: { title, blocks: [] },
    lastModified: Math.round(stat.mtimeMs),
    offloaded: true,
    _filePath: filePath,
  };
}

/**
 * The largest note the app opens as text. A note is read whole and
 * synchronously on the main process, and a bigger one would stall the window
 * for every note behind it; it is listed instead, as unreadable.
 */
const MAX_NOTE_BYTES = 10 * 1024 * 1024;
/** The largest file shown in the note's place; a bigger one opens in its own app. */
const MAX_VIEWED_FILE_BYTES = 500 * 1024 * 1024;

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * A note file's text, or null when its bytes are not UTF-8 text the app can
 * edit: UTF-16 (its byte-order mark), a NUL byte (binary), or any sequence
 * that is not UTF-8 (Windows-1252, Latin-1). Decoded leniently, those bytes
 * become U+FFFD, and the first save would write that over the original. A
 * UTF-8 byte-order mark is kept as a character, so it round-trips.
 */
function noteText(bytes) {
  const utf16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (utf16) return null;
  if (bytes.includes(0)) return null;
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

// Notes whose file the app cannot edit as text: never written, only moved.
const _unreadable = new Set(); // noteId

/**
 * A note whose file is there but cannot be edited as text: `reason` says why
 * (`encoding`, `too-large`, `read`). Listed by its name, under the id the
 * index gives it, with no blocks, so nothing is hidden and nothing can be
 * typed into it; `write-note` only ever moves its file. Its identity hash is
 * of the bytes as the watcher reads them, so the app's own move of it is
 * known for the echo it is; a file never read has none.
 */
function unreadableNote(filePath, notesDir, stat, reason, bytes = null) {
  const relPath = path.relative(notesDir, filePath);
  const relDir = path.relative(notesDir, path.dirname(filePath));
  const title = path.basename(filePath, ".md");
  const id = indexedIdAt(relPath) ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  _idIndex[id] = relPath;
  _identity.set(id, {
    dev: stat.dev,
    ino: stat.ino,
    hash: bytes ? hashOf(bytes.toString("utf-8")) : null,
  });
  _unreadable.add(id);
  trace("M", "unreadable note", relPath, reason);
  return {
    id,
    title,
    folder: relDir ? relDir.split(path.sep).join("/") : null,
    content: { title, blocks: [] },
    lastModified: Math.round(stat.mtimeMs),
    unreadable: reason,
    _filePath: filePath,
  };
}

/**
 * The note a file holds, as the renderer takes it. Null only when the file is
 * gone; a file that is there but cannot be edited as text is still a note,
 * listed as unreadable (`unreadableNote`), never silently dropped.
 */
function parseNoteFile(filePath, notesDir, offloaded = false) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (offloaded) return offloadedNote(filePath, notesDir, stat);
  if (stat.size > MAX_NOTE_BYTES) return unreadableNote(filePath, notesDir, stat, "too-large");
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    console.warn("Note could not be read", filePath, String(error));
    return unreadableNote(filePath, notesDir, stat, "read");
  }
  const raw = noteText(bytes);
  if (raw === null) return unreadableNote(filePath, notesDir, stat, "encoding", bytes);
  try {
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
    let id = indexedIdAt(relPath);
    // A legacy id already indexed at another path is that note's: this file is
    // a copy of it (Finder, Duplicate folder) and gets an id of its own.
    if (!id && migratedId && !(migratedId in _idIndex)) id = migratedId;
    // A note renamed or moved while the app was closed: its indexed path is
    // gone and this file holds exactly the text its history last kept, so it
    // is that note, and its versions follow it.
    if (!id && _adoptable.size) {
      const hash = history.hashText(raw);
      id = _adoptable.get(hash) ?? null;
      if (id) _adoptable.delete(hash);
    }
    if (!id) id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Update index
    _idIndex[id] = relPath;
    _unreadable.delete(id);
    recordIdentity(id, stat, raw);
    // History is a copy, kept outside the vault: a userData that cannot be
    // written must not keep the note itself from being listed.
    try {
      history.observe(id, raw);
    } catch (error) {
      console.warn("History could not record a note", relPath, String(error));
    }

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
      // anything populated it. One stat on a file already being read.
      lastModified: Math.round(stat.mtimeMs),
      _filePath: filePath,
    };
  } catch (error) {
    console.warn("Note could not be parsed", filePath, String(error));
    return unreadableNote(filePath, notesDir, stat, "read");
  }
}

// ─── Read all notes from vault ───

function readAllNotes(notesDir) {
  const notes = {};
  if (!fs.existsSync(notesDir)) return notes;

  loadIndex(notesDir);
  history.openVault(notesDir);

  // Notes whose indexed file is gone, by the text their history last kept.
  _adoptable.clear();
  for (const [id, relPath] of Object.entries(_idIndex)) {
    if (fs.existsSync(path.join(notesDir, relPath))) continue;
    const hash = history.latestHash(id);
    if (hash) _adoptable.set(hash, id);
  }

  // Offloaded notes are found in one batch before anything is read.
  const filePaths = [];
  walkNoteFiles(notesDir, (filePath) => filePaths.push(filePath));
  const offloaded = offloadedAmong(filePaths);
  for (const filePath of filePaths) {
    const note = parseNoteFile(filePath, notesDir, offloaded.has(filePath));
    if (note) notes[note.id] = note;
  }
  _adoptable.clear();

  // Clean stale index entries
  for (const [id, relPath] of Object.entries(_idIndex)) {
    if (!fs.existsSync(path.join(notesDir, relPath))) {
      delete _idIndex[id];
      _identity.delete(id);
    }
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
  // An offloaded note, downloaded: its text off the main thread, then parsed
  // as any note is. Null when its file is gone or the download failed.
  ipcMain.handle("download-note", async (_event, id) => {
    const notesDir = getNotesDir();
    const relPath = _idIndex[id];
    if (!relPath) return null;
    const filePath = path.join(notesDir, relPath);
    try {
      await readDownloading(filePath);
    } catch (error) {
      trace("M", "download-note failed", relPath, String(error));
      return null;
    }
    return parseNoteFile(filePath, notesDir);
  });

  // An offloaded note holds no text here, so only its name or folder can
  // have changed: its file is downloaded first (off the main thread) and its
  // own text is what it writes. Every other save is synchronous, so from the
  // write on no watcher event can arrive before the claim.
  ipcMain.handle("write-note", (_event, note) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const relPath = _idIndex[note.id];
    const filePath = relPath ? path.join(notesDir, relPath) : null;
    if (!filePath || !(note.offloaded || isOffloaded(filePath))) return writeNote(note, null);
    return readDownloading(filePath).then((diskBody) => {
      if (!note.offloaded) return writeNote(note, diskBody);
      const n = parseNoteFile(filePath, notesDir);
      if (!n) throw new Error("The offloaded note could not be read");
      return writeNote({ ...note, content: { ...n.content, title: note.title } }, diskBody);
    });
  });

  /** `diskBody`: the file's text when a download has just read it. */
  function writeNote(note, diskBody) {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    // The note's own file, if it has one (a title or folder change is a rename away from it).
    const existingRelPath = _idIndex[note.id];
    const existingPath = existingRelPath ? path.join(notesDir, existingRelPath) : null;

    // A save never lands over bytes the app has not seen. The note's file can
    // change under it between the last read or write and this save: an edit
    // in another app inside the write debounce, or one the watcher has yet to
    // report (it waits for the file to settle for 300 ms). Written over, the
    // outside edit would be lost, its event dropped as this save's echo. So
    // the bytes on disk are compared with the ones last seen, and a mismatch
    // refuses the write, moves nothing, and hands the renderer the disk
    // version as the outside change it is; the renderer keeps both, exactly as it does for a
    // change the watcher reports first. Reading the file records it as seen,
    // so the write that follows the conflict copy goes through.
    const identity = _identity.get(note.id);
    if (existingPath && identity?.hash && fs.existsSync(existingPath)) {
      const onDisk = diskBody ?? fs.readFileSync(existingPath, "utf-8");
      if (hashOf(onDisk) !== identity.hash) {
        trace("M", "write-note refused: file changed on disk", existingRelPath);
        return { stale: true, note: parseNoteFile(existingPath, notesDir) };
      }
    }

    if (note.unreadable || _unreadable.has(note.id))
      return moveUnreadable(note, existingPath, existingRelPath);

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
    // an unlink of the old name and an add of the new;
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

    // A rename away from the note's file keeps that file's permission bits;
    // every other write keeps the target's own (or makes a file the ordinary way).
    writeFileAtomic(finalPath, bodyMd, existingPath && !sameFile ? existingPath : finalPath);
    // Claimed after the write: a claim describes bytes that are on disk. The
    // handler is synchronous, so no watcher event can arrive in between.
    watcher.claimWrite(finalPath, bodyMd);

    // On rename, remove the old file only after the new one is safely on disk —
    // a crash in between leaves a duplicate (recoverable), never a missing note.
    // The directory it leaves stays, however empty: a folder is a directory
    // the user made, and only an explicit folder removal takes one away.
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
    // The atomic write made a new inode; the note's identity is that file now.
    // The file can be gone already, deleted outside the app the moment it
    // landed. The write still happened, so it still answers as done: thrown,
    // the renderer kept the note dirty and its retry wrote the deleted file
    // back. With no identity, the watcher's unlink is the delete it is.
    try {
      recordIdentity(note.id, fs.statSync(realPath), bodyMd);
    } catch {
      _identity.delete(note.id);
    }
    saveIndex(notesDir);
    history.recordWrite(note.id, bodyMd);

    trace(
      "M",
      "write-note done",
      path.relative(notesDir, realPath),
      `${Date.now() - traceStart}ms`,
      `${bodyMd.length}b`,
    );
    const result = { filePath: realPath, title: path.basename(realPath, ".md") };
    // The downloaded text goes back with the answer, so the note stops being offloaded.
    if (note.offloaded) result.downloaded = { ...note, offloaded: undefined };
    return result;
  }

  /**
   * A note the app cannot edit as text keeps its file's bytes: a rename or a
   * move is the file renamed, whatever text the note handed in holds, and
   * nothing is ever written. The bytes are claimed as the watcher will read
   * them, so the move's own events are known for echoes.
   */
  function moveUnreadable(note, existingPath, existingRelPath) {
    const notesDir = getNotesDir();
    if (!existingPath || !fs.existsSync(existingPath))
      throw new Error("A note that cannot be read has no file to keep");
    const { finalPath } = resolveWritePath(
      noteToFilePath(note, notesDir, existingRelPath),
      existingPath,
    );
    if (finalPath !== existingPath) {
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      watcher.claimUnlink(existingPath);
      try {
        fs.renameSync(existingPath, finalPath);
      } catch (error) {
        watcher.releaseUnlinkClaim(existingPath);
        throw error;
      }
      trace("M", "unreadable note moved", path.relative(notesDir, finalPath));
      try {
        watcher.claimWrite(finalPath, fs.readFileSync(finalPath, "utf-8"));
      } catch {
        // Unreadable even to claim: its add is the change it looks like.
      }
    }
    const realPath = path.join(path.dirname(finalPath), realBasename(finalPath));
    _idIndex[note.id] = path.relative(notesDir, realPath);
    saveIndex(notesDir);
    return { filePath: realPath, title: path.basename(realPath, ".md") };
  }

  // Recently Deleted: the notes the app sent to the Trash in the last 30 days,
  // by the place they had; one put back where it was (its folder made again if
  // it went, a `-2` if the name is taken), keeping its id so its history is its
  // own again; one deleted for good.
  ipcMain.handle("list-deleted-notes", () =>
    history.listDeleted().map(({ id, path: rel, at }) => {
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      return {
        id,
        name: rel.slice(rel.lastIndexOf("/") + 1).replace(/\.md$/, ""),
        folder: dir,
        at,
      };
    }),
  );

  ipcMain.handle("restore-deleted-note", (_event, id) => {
    if (typeof id !== "string") return null;
    const found = history.deletedText(id);
    if (!found) return null;
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const target = insideVault(notesDir, found.path);
    if (!target || !target.endsWith(".md")) return null;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const finalPath = ensureUniqueFilePath(target);
    writeFileAtomic(finalPath, found.text);
    watcher.claimWrite(finalPath, found.text);
    _idIndex[id] = path.relative(notesDir, finalPath);
    saveIndex(notesDir);
    const note = parseNoteFile(finalPath, notesDir);
    history.noteRestored(id);
    trace("M", "restored deleted note", path.relative(notesDir, finalPath));
    return note;
  });

  // Its last text, to look at before it comes back: read from the history
  // store, nothing written to the vault.
  ipcMain.handle("read-deleted-note", (_event, id) =>
    typeof id === "string" ? (history.deletedText(id)?.text ?? null) : null,
  );

  ipcMain.handle("purge-deleted-note", (_event, id) =>
    typeof id === "string" ? history.purgeDeleted(id) : false,
  );

  ipcMain.handle("save-image", (_event, { fileName, dataBase64 }) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const attDir = path.join(notesDir, "attachments");
    fs.mkdirSync(attDir, { recursive: true });
    const finalPath = ensureUniqueFilePath(path.join(attDir, attachmentName(fileName)));
    fs.writeFileSync(finalPath, Buffer.from(dataBase64, "base64"));
    return path.basename(finalPath);
  });

  ipcMain.handle("save-attachment", (_event, { fileName, dataBase64 }) => {
    const notesDir = getNotesDir();
    assertVaultPresent(notesDir);
    const attDir = path.join(notesDir, "attachments");
    fs.mkdirSync(attDir, { recursive: true });
    const finalPath = ensureUniqueFilePath(path.join(attDir, attachmentName(fileName)));
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

  // A file shown in the note's place (a PDF): its bytes, for the renderer to
  // draw. Inside the vault only, and only a file; null for anything else, or
  // past the cap, so a stray path can never stream the disk into the window.
  ipcMain.handle("read-vault-file", async (_event, relPath) => {
    const abs = typeof relPath === "string" ? insideVault(getNotesDir(), relPath) : null;
    const stat = abs ? fs.statSync(abs, { throwIfNoEntry: false }) : null;
    if (!stat?.isFile() || stat.size > MAX_VIEWED_FILE_BYTES) return null;
    try {
      return await fs.promises.readFile(abs);
    } catch {
      return null;
    }
  });

  ipcMain.handle("show-item-in-folder", (_event, absolutePath) => {
    const abs = insideVault(getNotesDir(), absolutePath);
    if (abs && fs.existsSync(abs)) shell.showItemInFolder(abs);
  });

  // File → Show in Finder: the open note's file, found by its id in the index
  // (the renderer knows the note, not where the disk put it).
  ipcMain.handle("reveal-note", (_event, noteId) => {
    const rel = typeof noteId === "string" ? _idIndex[noteId] : undefined;
    const abs = rel ? insideVault(getNotesDir(), rel) : null;
    if (abs && fs.existsSync(abs)) shell.showItemInFolder(abs);
  });

  // A note links to an attachment that is not in the vault: the person picks
  // the file wherever it went, and it is copied in under the name the note
  // already links to, so the link resolves and the note changes no byte.
  // True once the file is there (already, or copied); false when cancelled.
  ipcMain.handle("find-attachment", async (_event, filename) => {
    const notesDir = getNotesDir();
    if (typeof filename !== "string" || !filename) return false;
    const dest = insideVault(notesDir, path.join("attachments", filename));
    if (!dest) return false;
    if (fs.existsSync(dest)) return true;
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ["openFile"],
      defaultPath: _lastPickDir,
      message: `Find ${path.basename(filename)}`,
    });
    if (result.canceled || !result.filePaths[0]) return false;
    _lastPickDir = path.dirname(result.filePaths[0]);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(result.filePaths[0], dest, fs.constants.COPYFILE_EXCL);
    return true;
  });

  ipcMain.handle("pick-file", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ["openFile"],
      defaultPath: _lastPickDir,
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    _lastPickDir = path.dirname(filePath);
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

  ipcMain.handle("copy-image-to-clipboard", async (_event, filename) => {
    const notesDir = getNotesDir();
    if (typeof filename !== "string") return false;
    const absPath = insideVault(notesDir, path.join("attachments", filename));
    if (!absPath || !fs.existsSync(absPath)) return false;
    try {
      // Electron 44's clipboard is the W3C one: `writeImage` went, and an
      // image is written as a PNG blob, whatever the file's own format.
      const png = nativeImage.createFromPath(absPath).toPNG();
      await clipboard.write([
        new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) }),
      ]);
      return true;
    } catch {
      return false;
    }
  });

  // Copy text: the note's Markdown as text, and as HTML for apps that take
  // formatting. Written here rather than by the page's copy event, so it works
  // from the menu bar too, which gives the page no gesture to copy with.
  ipcMain.handle("copy-text-to-clipboard", async (_event, { text, html } = {}) => {
    if (typeof text !== "string") return false;
    try {
      const item = { "text/plain": new Blob([text], { type: "text/plain" }) };
      if (typeof html === "string" && html)
        item["text/html"] = new Blob([html], { type: "text/html" });
      await clipboard.write([new ClipboardItem(item)]);
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
      defaultPath: _lastPickDir,
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    _lastPickDir = path.dirname(filePath);
    const dataBase64 = fs.readFileSync(filePath).toString("base64");
    return { fileName: path.basename(filePath), dataBase64 };
  });
}

export {
  insideVault,
  sanitizeFilename,
  MAX_NAME_BYTES,
  MAX_NOTE_BYTES,
  ensureUniqueFilePath,
  hashOf,
  relocateNote,
  getIdIndex,
  setIndexDir,
  indexPath,
  loadIndex,
  saveIndex,
  parseNoteFile,
  readAllNotes,
  walkNoteFiles,
  registerNoteFileIPC,
};
