/**
 * Capacitor implementation of the electronAPI interface.
 * Replicates the Electron file-based storage format (.md files + .boojy-index.json)
 * so that notes are compatible across platforms and ready for iCloud sync.
 */
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { blocksToMarkdown, markdownToBlocks } from "../utils/markdown.js";

const NOTES_DIR = "BoojyNotes";
const INDEX_FILE = `${NOTES_DIR}/.boojy-index.json`;
const ATTACHMENTS_DIR = `${NOTES_DIR}/.attachments`;
const TRASH_DIR = `${NOTES_DIR}/.trash`;

// ─── Helpers ──────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Untitled";
}

async function ensureDir(path) {
  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (e) {
    // Directory already exists — ignore
    if (!e.message?.includes("exist")) throw e;
  }
}

async function readIndex() {
  try {
    const result = await Filesystem.readFile({
      path: INDEX_FILE,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(result.data);
  } catch {
    return {};
  }
}

async function saveIndex(index) {
  await ensureDir(NOTES_DIR);
  await Filesystem.writeFile({
    path: INDEX_FILE,
    directory: Directory.Documents,
    data: JSON.stringify(index, null, 2),
    encoding: Encoding.UTF8,
  });
}

function noteToRelativePath(note) {
  const sanitized = sanitizeFilename(note.title || "Untitled") + ".md";
  if (note.folder) {
    const folderParts = note.folder.split("/").map(sanitizeFilename);
    return [NOTES_DIR, ...folderParts, sanitized].join("/");
  }
  return `${NOTES_DIR}/${sanitized}`;
}

async function fileExists(path) {
  try {
    await Filesystem.stat({ path, directory: Directory.Documents });
    return true;
  } catch {
    return false;
  }
}

async function ensureUniqueFilePath(basePath) {
  if (!(await fileExists(basePath))) return basePath;
  const ext = basePath.lastIndexOf(".") !== -1 ? basePath.slice(basePath.lastIndexOf(".")) : "";
  const stem = ext ? basePath.slice(0, basePath.lastIndexOf(".")) : basePath;
  let i = 2;
  while (await fileExists(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

// ─── Core note methods ────────────────────────────────────────────

async function readAllNotes() {
  const index = await readIndex();
  const notes = {};

  for (const [noteId, relPath] of Object.entries(index)) {
    const fullPath = relPath.startsWith(NOTES_DIR) ? relPath : `${NOTES_DIR}/${relPath}`;
    try {
      const result = await Filesystem.readFile({
        path: fullPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      const md = result.data;
      const blocks = markdownToBlocks(md);

      // Derive title and folder from the path
      const pathWithinNotes = fullPath.slice(NOTES_DIR.length + 1); // e.g. "folder/Title.md"
      const parts = pathWithinNotes.split("/");
      const filename = parts.pop(); // "Title.md"
      const title = filename.replace(/\.md$/, "");
      const folder = parts.length > 0 ? parts.join("/") : null;

      notes[noteId] = {
        id: noteId,
        title,
        folder,
        path: folder ? [...folder.split("/"), title] : undefined,
        content: { title, blocks },
        words: blocks
          .filter((b) => b.text)
          .map((b) => b.text)
          .join(" ")
          .split(/\s+/)
          .filter(Boolean).length,
      };
    } catch {
      // File missing — remove from index
      delete index[noteId];
    }
  }

  // Save cleaned index if any entries were removed
  await saveIndex(index);
  return notes;
}

async function writeNote(note) {
  const index = await readIndex();
  const oldPath = index[note.id];
  const newPath = noteToRelativePath(note);

  // Ensure folder exists
  const dir = newPath.slice(0, newPath.lastIndexOf("/"));
  await ensureDir(dir);

  // Convert blocks to markdown
  const md = blocksToMarkdown(note.content?.blocks || []);

  await Filesystem.writeFile({
    path: newPath,
    directory: Directory.Documents,
    data: md,
    encoding: Encoding.UTF8,
  });

  // If path changed (rename/move), delete old file
  if (oldPath && oldPath !== newPath) {
    try {
      await Filesystem.deleteFile({
        path: oldPath,
        directory: Directory.Documents,
      });
    } catch {
      // Old file may not exist
    }
  }

  // Update index
  index[note.id] = newPath;
  await saveIndex(index);
}

async function deleteNoteFile(noteId) {
  const index = await readIndex();
  const filePath = index[noteId];
  if (filePath) {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Documents,
      });
    } catch {
      // Already gone
    }
    delete index[noteId];
    await saveIndex(index);
  }
}

// ─── Trash ────────────────────────────────────────────────────────

async function trashNote(noteId, title, folder) {
  const index = await readIndex();
  const filePath = index[noteId];

  // Read the note content before trashing
  let content = { blocks: [] };
  if (filePath) {
    try {
      const result = await Filesystem.readFile({
        path: filePath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      content = { blocks: markdownToBlocks(result.data) };
    } catch {
      // File missing
    }
  }

  // Write trash entry
  await ensureDir(TRASH_DIR);
  const trashData = {
    id: noteId,
    title: title || "Untitled",
    folder: folder || null,
    deletedAt: Date.now(),
    content,
  };
  await Filesystem.writeFile({
    path: `${TRASH_DIR}/${noteId}.json`,
    directory: Directory.Documents,
    data: JSON.stringify(trashData),
    encoding: Encoding.UTF8,
  });

  // Delete original file
  if (filePath) {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Documents,
      });
    } catch {
      // Already gone
    }
  }

  delete index[noteId];
  await saveIndex(index);
}

async function readTrash() {
  try {
    const listing = await Filesystem.readdir({
      path: TRASH_DIR,
      directory: Directory.Documents,
    });
    const trashed = {};
    for (const entry of listing.files) {
      if (!entry.name.endsWith(".json")) continue;
      try {
        const result = await Filesystem.readFile({
          path: `${TRASH_DIR}/${entry.name}`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        const data = JSON.parse(result.data);
        trashed[data.id] = data;
      } catch {
        // Corrupt entry
      }
    }
    return trashed;
  } catch {
    return {};
  }
}

async function restoreNote(noteId) {
  try {
    const result = await Filesystem.readFile({
      path: `${TRASH_DIR}/${noteId}.json`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    const data = JSON.parse(result.data);

    // Write it back as a .md note
    const note = {
      id: data.id,
      title: data.title,
      folder: data.folder,
      content: data.content,
    };
    await writeNote(note);

    // Delete trash entry
    await Filesystem.deleteFile({
      path: `${TRASH_DIR}/${noteId}.json`,
      directory: Directory.Documents,
    });

    return note;
  } catch (err) {
    console.error("restoreNote failed", err);
    return null;
  }
}

async function purgeTrash(noteIds) {
  if (noteIds === null) {
    // Auto-purge: delete trash entries older than 30 days
    const trashed = await readTrash();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, data] of Object.entries(trashed)) {
      if (data.deletedAt < cutoff) {
        try {
          await Filesystem.deleteFile({
            path: `${TRASH_DIR}/${id}.json`,
            directory: Directory.Documents,
          });
        } catch {
          // Already gone
        }
      }
    }
    return;
  }

  for (const id of noteIds) {
    try {
      await Filesystem.deleteFile({
        path: `${TRASH_DIR}/${id}.json`,
        directory: Directory.Documents,
      });
    } catch {
      // Already gone
    }
  }
}

async function emptyTrash() {
  try {
    const listing = await Filesystem.readdir({
      path: TRASH_DIR,
      directory: Directory.Documents,
    });
    for (const entry of listing.files) {
      try {
        await Filesystem.deleteFile({
          path: `${TRASH_DIR}/${entry.name}`,
          directory: Directory.Documents,
        });
      } catch {
        // Ignore
      }
    }
  } catch {
    // Trash dir doesn't exist
  }
}

// ─── Attachments ──────────────────────────────────────────────────

async function saveImage({ fileName, dataBase64 }) {
  await ensureDir(ATTACHMENTS_DIR);
  const safeName =
    sanitizeFilename(fileName.replace(/\.[^.]+$/, "")) +
    (fileName.lastIndexOf(".") !== -1
      ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
      : "");
  const fullPath = `${ATTACHMENTS_DIR}/${safeName}`;
  const finalPath = await ensureUniqueFilePath(fullPath);
  await Filesystem.writeFile({
    path: finalPath,
    directory: Directory.Documents,
    data: dataBase64,
  });
  return finalPath.split("/").pop();
}

async function saveAttachment({ fileName, dataBase64 }) {
  const filename = await saveImage({ fileName, dataBase64 });
  let size = 0;
  try {
    const stat = await Filesystem.stat({
      path: `${ATTACHMENTS_DIR}/${filename}`,
      directory: Directory.Documents,
    });
    size = stat.size;
  } catch {
    // Estimate from base64
    size = Math.floor((dataBase64.length * 3) / 4);
  }
  return { filename, size };
}

async function pickImageFile() {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 90,
    });
    const ext = photo.format || "jpeg";
    const ts = Date.now();
    return {
      fileName: `photo-${ts}.${ext}`,
      dataBase64: photo.base64String,
    };
  } catch {
    return null; // User cancelled
  }
}

async function pickFile() {
  // Use a hidden file input as fallback on Capacitor
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      const dataBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      resolve({ fileName: file.name, dataBase64 });
    });
    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve(null);
    });
    input.click();
  });
}

async function resolveAttachment(filename) {
  try {
    const { uri } = await Filesystem.getUri({
      path: `${ATTACHMENTS_DIR}/${filename}`,
      directory: Directory.Documents,
    });
    return uri;
  } catch {
    return null;
  }
}

async function getFileSize(filename) {
  try {
    const stat = await Filesystem.stat({
      path: `${ATTACHMENTS_DIR}/${filename}`,
      directory: Directory.Documents,
    });
    return stat.size;
  } catch {
    return null;
  }
}

// ─── Folder metadata ──────────────────────────────────────────────

async function readMeta(folderRelPath) {
  const metaPath = folderRelPath
    ? `${NOTES_DIR}/${folderRelPath}/.folder-meta.json`
    : `${NOTES_DIR}/.folder-meta.json`;
  try {
    const result = await Filesystem.readFile({
      path: metaPath,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(result.data);
  } catch {
    return null;
  }
}

async function writeMeta(folderRelPath, meta) {
  const dir = folderRelPath ? `${NOTES_DIR}/${folderRelPath}` : NOTES_DIR;
  await ensureDir(dir);
  const metaPath = `${dir}/.folder-meta.json`;
  await Filesystem.writeFile({
    path: metaPath,
    directory: Directory.Documents,
    data: JSON.stringify(meta, null, 2),
    encoding: Encoding.UTF8,
  });
}

// ─── Settings ─────────────────────────────────────────────────────

async function getSettings() {
  try {
    const { value } = await Preferences.get({ key: "boojy-settings" });
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function setSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await Preferences.set({
    key: "boojy-settings",
    value: JSON.stringify(settings),
  });
}

// ─── Misc ─────────────────────────────────────────────────────────

async function openExternal(url) {
  await Browser.open({ url });
}

function getNotesDir() {
  return "Documents/BoojyNotes";
}

// ─── No-op stubs ──────────────────────────────────────────────────

const noop = () => {};
const asyncNoop = async () => {};
const noopUnsub = () => () => {};
const unsupportedOp = (feature) => async () => {
  console.warn(`[Boojy] ${feature} is not available on this platform`);
};

const capacitorAPI = {
  // Core note operations
  getNotesDir,
  readAllNotes,
  writeNote,
  deleteNoteFile,

  // Trash
  trashNote,
  readTrash,
  restoreNote,
  purgeTrash,
  emptyTrash,

  // Attachments
  saveImage,
  saveAttachment,
  pickImageFile,
  pickFile,
  resolveAttachment,
  getFileSize,
  copyImageToClipboard: asyncNoop,

  // Metadata
  readMeta,
  writeMeta,

  // Settings
  getSettings,
  setSetting,
  toggleSpellcheck: asyncNoop,

  // Navigation
  openExternal,
  openPath: asyncNoop,
  showItemInFolder: asyncNoop,

  // Window (no-op on mobile)
  chooseNotesDir: asyncNoop,
  setWindowTitle: noop,

  // Export/Import (not available on mobile)
  exportPdf: unsupportedOp("PDF export"),
  exportDocx: unsupportedOp("DOCX export"),
  importMarkdown: unsupportedOp("Markdown import"),
  importHtml: unsupportedOp("HTML import"),
  importFolder: unsupportedOp("Folder import"),

  // Menu listeners (no-op — no native menu on mobile)
  onMenuExport: noopUnsub,
  onMenuImport: noopUnsub,

  // File watchers (no-op — no chokidar on mobile)
  onFileChanged: noopUnsub,
  onFileDeleted: noopUnsub,

  // Auto-update (no-op — mobile uses App Store)
  checkForUpdate: asyncNoop,
  installUpdate: asyncNoop,
  getUpdateStatus: async () => ({ state: "idle" }),
  setAutoUpdate: asyncNoop,
  getAutoUpdate: async () => false,
  onUpdateStatus: noopUnsub,

  // Secure storage (uses Preferences on mobile — keyStorage.js handles this directly)
  secureStorage: {
    store: async (key, value) => {
      await Preferences.set({ key: `boojy-ai-key-${key}`, value });
    },
    read: async (key) => {
      const { value } = await Preferences.get({ key: `boojy-ai-key-${key}` });
      return value || "";
    },
    delete: async (key) => {
      await Preferences.remove({ key: `boojy-ai-key-${key}` });
    },
  },

  // Terminal (no-op on mobile)
  terminal: {
    create: asyncNoop,
    write: noop,
    resize: noop,
    kill: asyncNoop,
    killAll: asyncNoop,
    onData: noopUnsub,
    onExit: noopUnsub,
  },
};

export default capacitorAPI;
