import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  protocol,
  net,
  shell,
  clipboard,
  nativeImage,
  nativeTheme,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { watch } from "chokidar";
import { blocksToMarkdown, markdownToBlocks, parseFrontmatter } from "./markdown.js";
import { registerTerminalIPC, killAllTerminals } from "./terminal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config (vault path) ───

const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

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

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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
    const folderParts = note.folder.split("/").map(sanitizeFilename);
    return path.join(notesDir, ...folderParts, sanitized);
  }
  return path.join(notesDir, sanitized);
}

function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return path.join(dir, `${base}-${i}${ext}`);
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
      if (entry.name.startsWith(".") || entry.name === "attachments") continue; // skip dotfiles/dirs and attachments
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
      if (p === relPath) {
        id = noteId;
        break;
      }
    }
    if (!id) id = migratedId || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Update index
    _idIndex[id] = relPath;

    const blocks = markdownToBlocks(body);
    const text = blocks.map((b) => b.text || "").join(" ");
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
    title: "Boojy Notes",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 8 },
    backgroundColor: "#2C2C32",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
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
    ignored: [/(^|[/\\])\./, /\.boojy-index\.json$/, /[/\\]attachments[/\\]/], // ignore dotfiles, index, and attachments
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

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

ipcMain.handle("resolve-attachment", (_event, filename) => {
  const notesDir = getNotesDir();
  // Search order: attachments/ folder → vault root
  const candidates = [path.join(notesDir, "attachments", filename), path.join(notesDir, filename)];
  // Also check legacy .attachments/ subfolders
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
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const dataBase64 = fs.readFileSync(filePath).toString("base64");
  const size = fs.statSync(filePath).size;
  return { fileName: path.basename(filePath), dataBase64, size };
});

ipcMain.handle("get-file-size", (_event, filename) => {
  const notesDir = getNotesDir();
  const candidates = [path.join(notesDir, "attachments", filename), path.join(notesDir, filename)];
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

ipcMain.handle("read-meta", (_event, folderRelPath) => {
  const metaPath = path.join(getNotesDir(), folderRelPath || "", ".boojy-meta.json");
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
});

ipcMain.handle("write-meta", (_event, folderRelPath, meta) => {
  const dir = path.join(getNotesDir(), folderRelPath || "");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".boojy-meta.json"), JSON.stringify(meta, null, 2));
});

// ─── Trash helpers ───

function trashDir(notesDir) {
  return path.join(notesDir, ".trash");
}

function trashMetaPath(notesDir) {
  return path.join(trashDir(notesDir), ".boojy-trash-meta.json");
}

function loadTrashMeta(notesDir) {
  try {
    return JSON.parse(fs.readFileSync(trashMetaPath(notesDir), "utf-8"));
  } catch {
    return {};
  }
}

function saveTrashMeta(notesDir, meta) {
  const dir = trashDir(notesDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(trashMetaPath(notesDir), JSON.stringify(meta, null, 2));
}

// ─── Trash IPC handlers ───

ipcMain.handle("trash-note", (_event, noteId, title, folder) => {
  const notesDir = getNotesDir();
  const relPath = _idIndex[noteId];
  const filePath = relPath ? path.join(notesDir, relPath) : null;
  if (!filePath || !fs.existsSync(filePath)) return { trashed: false };

  const dest = trashDir(notesDir);
  fs.mkdirSync(dest, { recursive: true });

  // Move .md file to .trash/{noteId}.md
  const trashFile = path.join(dest, `${noteId}.md`);
  try {
    fs.renameSync(filePath, trashFile);
  } catch {
    // Cross-device: copy + delete
    fs.copyFileSync(filePath, trashFile);
    fs.unlinkSync(filePath);
  }

  // Clean empty parent dirs
  const dir = path.dirname(filePath);
  if (dir !== notesDir) {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) fs.rmdirSync(dir);
    } catch {
      /* dir not empty */
    }
  }

  // Update metadata
  const meta = loadTrashMeta(notesDir);
  meta[noteId] = {
    deletedAt: Date.now(),
    originalFolder: folder || null,
    originalTitle: title || "Untitled",
  };
  saveTrashMeta(notesDir, meta);

  // Remove from index
  delete _idIndex[noteId];
  saveIndex(notesDir);

  return { trashed: true };
});

ipcMain.handle("read-trash", () => {
  const notesDir = getNotesDir();
  const meta = loadTrashMeta(notesDir);
  const result = {};
  const stale = [];

  for (const [noteId, info] of Object.entries(meta)) {
    const trashFile = path.join(trashDir(notesDir), `${noteId}.md`);
    if (!fs.existsSync(trashFile)) {
      stale.push(noteId);
      continue;
    }
    try {
      const raw = fs.readFileSync(trashFile, "utf-8");
      const blocks = markdownToBlocks(raw);
      result[noteId] = {
        id: noteId,
        title: info.originalTitle,
        folder: info.originalFolder,
        deletedAt: info.deletedAt,
        content: { title: info.originalTitle, blocks },
      };
    } catch {
      stale.push(noteId);
    }
  }

  // Clean stale entries
  if (stale.length > 0) {
    for (const id of stale) delete meta[id];
    saveTrashMeta(notesDir, meta);
  }

  return result;
});

ipcMain.handle("restore-note", (_event, noteId) => {
  const notesDir = getNotesDir();
  const meta = loadTrashMeta(notesDir);
  const info = meta[noteId];
  if (!info) return null;

  const trashFile = path.join(trashDir(notesDir), `${noteId}.md`);
  if (!fs.existsSync(trashFile)) return null;

  // Reconstruct target path
  const sanitizedTitle = sanitizeFilename(info.originalTitle || "Untitled") + ".md";
  let targetPath;
  if (info.originalFolder) {
    const folderParts = info.originalFolder.split("/").map(sanitizeFilename);
    const folderDir = path.join(notesDir, ...folderParts);
    fs.mkdirSync(folderDir, { recursive: true });
    targetPath = path.join(folderDir, sanitizedTitle);
  } else {
    targetPath = path.join(notesDir, sanitizedTitle);
  }
  targetPath = ensureUniqueFilePath(targetPath);

  // Move file back
  try {
    fs.renameSync(trashFile, targetPath);
  } catch {
    fs.copyFileSync(trashFile, targetPath);
    fs.unlinkSync(trashFile);
  }

  // Re-add to index
  _idIndex[noteId] = path.relative(notesDir, targetPath);
  saveIndex(notesDir);

  // Remove from trash metadata
  delete meta[noteId];
  saveTrashMeta(notesDir, meta);

  // Parse and return the restored note
  const note = parseNoteFile(targetPath, notesDir);
  return note;
});

ipcMain.handle("purge-trash", (_event, noteIds) => {
  const notesDir = getNotesDir();
  const meta = loadTrashMeta(notesDir);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const purged = [];

  const toPurge = noteIds
    ? noteIds.filter((id) => meta[id])
    : Object.entries(meta)
        .filter(([, info]) => now - info.deletedAt > thirtyDaysMs)
        .map(([id]) => id);

  for (const noteId of toPurge) {
    const trashFile = path.join(trashDir(notesDir), `${noteId}.md`);
    try {
      fs.unlinkSync(trashFile);
    } catch {
      /* already gone */
    }
    const trashAttDir = path.join(trashDir(notesDir), ".attachments", noteId);
    try {
      fs.rmSync(trashAttDir, { recursive: true, force: true });
    } catch {
      /* no attachments */
    }
    delete meta[noteId];
    purged.push(noteId);
  }

  saveTrashMeta(notesDir, meta);
  return { purged };
});

ipcMain.handle("empty-trash", () => {
  const notesDir = getNotesDir();
  const dir = trashDir(notesDir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* nothing to delete */
  }
  return { emptied: true };
});

// ─── Settings IPC handlers ───

ipcMain.handle("get-settings", () => loadSettings());

ipcMain.handle("set-setting", (_event, key, value) => {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
});

ipcMain.on("set-window-title", (_, title) => {
  if (mainWindow) mainWindow.setTitle(title);
});

ipcMain.handle("toggle-spellcheck", (_event, { enabled, languages }) => {
  const settings = loadSettings();
  settings.spellCheckEnabled = enabled;
  if (languages) settings.spellCheckLanguages = languages;
  saveSettings(settings);
  if (mainWindow) {
    const langs = enabled ? languages || settings.spellCheckLanguages || ["en-US"] : [];
    mainWindow.webContents.session.setSpellCheckerLanguages(langs);
  }
  return settings;
});

// ─── Export IPC handlers ───

ipcMain.handle("export:pdf", async (_event, { html, title }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: sanitizeFilename(title) + ".pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled) return { exported: false };
  const { exportToPDF } = await import("./export.js");
  await exportToPDF(html, title, result.filePath);
  return { exported: true, filePath: result.filePath };
});

ipcMain.handle("export:docx", async (_event, { blocks, title }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: sanitizeFilename(title) + ".docx",
    filters: [{ name: "Word Document", extensions: ["docx"] }],
  });
  if (result.canceled) return { exported: false };
  const { exportToDocx } = await import("./export.js");
  await exportToDocx(blocks, title, result.filePath);
  return { exported: true, filePath: result.filePath };
});

// ─── Import IPC handlers ───

ipcMain.handle("import:markdown", async (_event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });
  if (result.canceled) return { imported: [] };
  const { importMarkdownFiles } = await import("./import.js");
  const notesDir = getNotesDir();
  const targetDir = opts?.targetFolder ? path.join(notesDir, opts.targetFolder) : notesDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const imported = importMarkdownFiles(result.filePaths, targetDir);
  return { imported };
});

ipcMain.handle("import:html", async (_event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
  });
  if (result.canceled) return { imported: [] };
  const { importHtmlFiles } = await import("./import.js");
  const notesDir = getNotesDir();
  const targetDir = opts?.targetFolder ? path.join(notesDir, opts.targetFolder) : notesDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const imported = await importHtmlFiles(result.filePaths, targetDir);
  return { imported };
});

ipcMain.handle("import:folder", async (_event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return { imported: [] };
  const { importMarkdownFolder } = await import("./import.js");
  const notesDir = getNotesDir();
  const targetDir = opts?.targetFolder ? path.join(notesDir, opts.targetFolder) : notesDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const imported = importMarkdownFolder(result.filePaths[0], targetDir);
  return { imported };
});

ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("pick-image-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const dataBase64 = fs.readFileSync(filePath).toString("base64");
  return { fileName: path.basename(filePath), dataBase64 };
});

// ─── App lifecycle ───

app.whenReady().then(() => {
  app.setName("Boojy Notes");
  nativeTheme.themeSource = "dark";

  // Custom protocol for resolving attachment paths to actual files
  protocol.handle("boojy-att", (request) => {
    const relativePath = decodeURIComponent(request.url.slice("boojy-att://".length));
    const notesDir = getNotesDir();
    // Try exact relative path first, then attachments/ folder, then legacy .attachments/
    let absPath = path.join(notesDir, relativePath);
    if (!fs.existsSync(absPath)) {
      const inAttachments = path.join(notesDir, "attachments", relativePath);
      if (fs.existsSync(inAttachments)) {
        absPath = inAttachments;
      }
    }
    return net.fetch("file://" + absPath.replace(/\\/g, "/"));
  });

  // Build custom menu (strips devTools from production builds)
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "Boojy Notes",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Export",
          submenu: [
            {
              label: "PDF...",
              click: () => mainWindow?.webContents.send("menu:export", "pdf"),
            },
            {
              label: "DOCX...",
              click: () => mainWindow?.webContents.send("menu:export", "docx"),
            },
          ],
        },
        {
          label: "Import",
          submenu: [
            {
              label: "Markdown Files...",
              click: () => mainWindow?.webContents.send("menu:import", "markdown"),
            },
            {
              label: "HTML Files...",
              click: () => mainWindow?.webContents.send("menu:import", "html"),
            },
            {
              label: "Folder...",
              click: () => mainWindow?.webContents.send("menu:import", "folder"),
            },
          ],
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  // Initialize spell check from saved settings
  const settings = loadSettings();
  const spellLangs = settings.spellCheckLanguages || ["en-US"];
  if (settings.spellCheckEnabled !== false) {
    mainWindow.webContents.session.setSpellCheckerLanguages(spellLangs);
  } else {
    mainWindow.webContents.session.setSpellCheckerLanguages([]);
  }

  // Context menu for spelling suggestions
  mainWindow.webContents.on("context-menu", (event, params) => {
    if (params.misspelledWord) {
      const menu = Menu.buildFromTemplate([
        ...params.dictionarySuggestions.map((s) => ({
          label: s,
          click: () => mainWindow.webContents.replaceMisspelling(s),
        })),
        { type: "separator" },
        {
          label: "Add to Dictionary",
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
      ]);
      menu.popup();
    }
  });

  startWatcher();
  registerTerminalIPC(ipcMain, () => mainWindow, getNotesDir);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killAllTerminals();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killAllTerminals();
  if (watcher) watcher.close();
});
