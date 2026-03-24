import { ipcMain, dialog, shell, clipboard, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { blocksToMarkdown, markdownToBlocks, parseFrontmatter } from "./markdown.js";

// ─── Filename helpers ───

function sanitizeFilename(name) {
  let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
  // Prevent path traversal via ".." or "." components
  if (sanitized === ".." || sanitized === ".") sanitized = "_";
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

// ─── Read all notes from vault ───

function readAllNotes(notesDir, suppressWatcher) {
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

// ─── Register IPC handlers ───

function registerNoteFileIPC(getMainWindow, getNotesDir, suppressWatcher) {
  ipcMain.handle("get-notes-dir", () => getNotesDir());

  ipcMain.handle("read-all-notes", () => {
    const notesDir = getNotesDir();
    fs.mkdirSync(notesDir, { recursive: true });
    return readAllNotes(notesDir, suppressWatcher);
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
      if (fs.existsSync(targetPath)) {
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
      const { dialog: dlg } = require("electron");
      dlg.showMessageBoxSync(getMainWindow(), {
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

  // ─── Export IPC handlers ───

  ipcMain.handle("export:pdf", async (_event, { html, title }) => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: sanitizeFilename(title) + ".pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled) return { exported: false };
    const { exportToPDF } = await import("./export.js");
    await exportToPDF(html, title, result.filePath);
    return { exported: true, filePath: result.filePath };
  });

  ipcMain.handle("export:docx", async (_event, { blocks, title }) => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
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
    const result = await dialog.showOpenDialog(getMainWindow(), {
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
    const result = await dialog.showOpenDialog(getMainWindow(), {
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
    const result = await dialog.showOpenDialog(getMainWindow(), {
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
}

export {
  sanitizeFilename,
  ensureUniqueFilePath,
  noteToFilePath,
  getIdIndex,
  loadIndex,
  saveIndex,
  parseNoteFile,
  readAllNotes,
  registerNoteFileIPC,
};
