import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { watch } from "chokidar";
import {
  blocksToMarkdown,
  markdownToBlocks,
  parseFrontmatter,
} from "./markdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config (vault path) ───

const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function getNotesDir() {
  const cfg = loadConfig();
  return cfg.notesDir || path.join(app.getPath("documents"), "Boojy", "Notes");
}

// ─── Filename helpers ───

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
}

function noteToFilePath(note, notesDir) {
  const sanitized = sanitizeFilename(note.title || "Untitled") + ".md";
  if (note.folder) {
    return path.join(notesDir, sanitizeFilename(note.folder), sanitized);
  }
  return path.join(notesDir, sanitized);
}

function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base} ${i}${ext}`))) i++;
  return path.join(dir, `${base} ${i}${ext}`);
}

// ─── Note ID index (.boojy-index.json) ───

let _idIndex = {}; // noteId → relative path

function indexPath(notesDir) {
  return path.join(notesDir, ".boojy-index.json");
}

function loadIndex(notesDir) {
  try {
    _idIndex = JSON.parse(fs.readFileSync(indexPath(notesDir), "utf-8"));
  } catch {
    _idIndex = {};
  }
  return _idIndex;
}

function saveIndex(notesDir) {
  fs.writeFileSync(indexPath(notesDir), JSON.stringify(_idIndex, null, 2));
}

// ─── Read all notes from vault ───

function readAllNotes(notesDir) {
  const notes = {};
  if (!fs.existsSync(notesDir)) return notes;

  loadIndex(notesDir);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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

  // Rewrite migrated files (strip frontmatter)
  for (const note of Object.values(notes)) {
    if (note._migrated) {
      const bodyMd = blocksToMarkdown(note.content.blocks);
      suppressWatcher(note._filePath);
      fs.writeFileSync(note._filePath, bodyMd, "utf-8");
    }
  }

  // Clean stale index entries
  for (const [id, relPath] of Object.entries(_idIndex)) {
    if (!fs.existsSync(path.join(notesDir, relPath))) delete _idIndex[id];
  }

  saveIndex(notesDir);
  return notes;
}

function parseNoteFile(filePath, notesDir) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(notesDir, filePath);
    const relDir = path.relative(notesDir, path.dirname(filePath));
    const folder = relDir || null;
    const title = path.basename(filePath, ".md");

    let body = raw;
    let migratedId = null;

    // Migration: strip frontmatter from old files, preserve their ID
    const fm = parseFrontmatter(raw);
    if (fm) {
      migratedId = fm.id;
      body = fm.body;
    }

    // Look up existing ID from index, or use migrated ID, or generate new
    let id = null;
    for (const [noteId, p] of Object.entries(_idIndex)) {
      if (p === relPath) { id = noteId; break; }
    }
    if (!id) id = migratedId || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Update index
    _idIndex[id] = relPath;

    const blocks = markdownToBlocks(body);
    const text = blocks.map(b => b.text || "").join(" ");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    return {
      id,
      title,
      folder,
      content: { title, blocks },
      words,
      _filePath: filePath,
      _migrated: !!fm,
    };
  } catch {
    return null;
  }
}

// ─── Window ───

let mainWindow = null;
let watcher = null;
const ignoredPaths = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: "hiddenInset",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dev: load Vite dev server; Prod: load built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ─── File watcher ───

function startWatcher() {
  const notesDir = getNotesDir();
  fs.mkdirSync(notesDir, { recursive: true });

  if (watcher) watcher.close();

  watcher = watch(notesDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    ignored: [/(^|[/\\])\./, /\.boojy-index\.json$/], // ignore dotfiles and index
  });

  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (ignoredPaths.has(filePath)) return;
    const note = parseNoteFile(filePath, notesDir);
    if (note && mainWindow) {
      saveIndex(notesDir);
      mainWindow.webContents.send("file-changed", note);
    }
  });

  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (ignoredPaths.has(filePath)) return;
    const note = parseNoteFile(filePath, notesDir);
    if (note && mainWindow) {
      saveIndex(notesDir);
      mainWindow.webContents.send("file-changed", note);
    }
  });

  watcher.on("unlink", (filePath) => {
    if (!filePath.endsWith(".md")) return;
    if (ignoredPaths.has(filePath)) return;
    // We can't read the file anymore, so send the relative path for identification
    mainWindow?.webContents.send("file-deleted", { filePath });
  });
}

function suppressWatcher(filePath) {
  ignoredPaths.add(filePath);
  setTimeout(() => ignoredPaths.delete(filePath), 1500);
}

// ─── IPC handlers ───

ipcMain.handle("get-notes-dir", () => getNotesDir());

ipcMain.handle("choose-notes-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Choose Notes Folder",
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  saveConfig({ ...loadConfig(), notesDir: dir });
  startWatcher(); // restart watcher on new dir
  return dir;
});

ipcMain.handle("read-all-notes", () => {
  const notesDir = getNotesDir();
  fs.mkdirSync(notesDir, { recursive: true });
  return readAllNotes(notesDir);
});

ipcMain.handle("write-note", (_event, note) => {
  const notesDir = getNotesDir();
  const targetPath = noteToFilePath(note, notesDir);

  // Check if this note already exists at a different path (title/folder rename)
  const existingRelPath = _idIndex[note.id];
  const existingPath = existingRelPath ? path.join(notesDir, existingRelPath) : null;

  if (existingPath && existingPath !== targetPath) {
    // Delete old file
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

  // Determine final path (avoid overwriting a different note's file)
  let finalPath = targetPath;
  if (!existingPath || existingPath !== targetPath) {
    // Only check uniqueness when creating new or moving
    if (fs.existsSync(targetPath)) {
      // Check if the existing file belongs to a different note
      const targetRelPath = path.relative(notesDir, targetPath);
      const ownerNoteId = Object.entries(_idIndex).find(([, p]) => p === targetRelPath)?.[0];
      if (ownerNoteId && ownerNoteId !== note.id) {
        finalPath = ensureUniqueFilePath(targetPath);
      }
    }
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });

  // Serialize — just markdown body, no frontmatter
  const bodyMd = blocksToMarkdown(note.content?.blocks || []);

  suppressWatcher(finalPath);
  fs.writeFileSync(finalPath, bodyMd, "utf-8");

  // Update index
  _idIndex[note.id] = path.relative(notesDir, finalPath);
  saveIndex(notesDir);

  return { filePath: finalPath };
});

ipcMain.handle("delete-note-file", (_event, noteId) => {
  const notesDir = getNotesDir();
  const relPath = _idIndex[noteId];
  const filePath = relPath ? path.join(notesDir, relPath) : null;
  if (!filePath) return { deleted: false };

  suppressWatcher(filePath);
  try {
    fs.unlinkSync(filePath);
    // Clean empty parent dirs
    const dir = path.dirname(filePath);
    if (dir !== notesDir) {
      try {
        const entries = fs.readdirSync(dir);
        if (entries.length === 0) fs.rmdirSync(dir);
      } catch {
        // dir not empty
      }
    }
    delete _idIndex[noteId];
    saveIndex(notesDir);
    return { deleted: true };
  } catch {
    return { deleted: false };
  }
});

// ─── App lifecycle ───

app.whenReady().then(() => {
  createWindow();
  startWatcher();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (watcher) watcher.close();
});
