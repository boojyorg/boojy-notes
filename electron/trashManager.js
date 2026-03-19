import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { markdownToBlocks } from "./markdown.js";
import {
  sanitizeFilename,
  ensureUniqueFilePath,
  getIdIndex,
  saveIndex,
  parseNoteFile,
} from "./noteFileManager.js";

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

// ─── Register trash IPC handlers ───

function registerTrashIPC(getNotesDir) {
  const _idIndex = getIdIndex();

  ipcMain.handle("trash-note", (_event, noteId, title, folder) => {
    const notesDir = getNotesDir();
    const idIndex = getIdIndex();
    const relPath = idIndex[noteId];
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
    delete idIndex[noteId];
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
    const idIndex = getIdIndex();
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
    idIndex[noteId] = path.relative(notesDir, targetPath);
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
}

export { registerTrashIPC };
