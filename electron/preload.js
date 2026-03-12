const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
  deleteNoteFile: (noteId) => ipcRenderer.invoke("delete-note-file", noteId),
  saveImage: (data) => ipcRenderer.invoke("save-image", data),
  saveAttachment: (data) => ipcRenderer.invoke("save-attachment", data),
  pickImageFile: () => ipcRenderer.invoke("pick-image-file"),
  pickFile: () => ipcRenderer.invoke("pick-file"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openPath: (absolutePath) => ipcRenderer.invoke("open-path", absolutePath),
  showItemInFolder: (absolutePath) => ipcRenderer.invoke("show-item-in-folder", absolutePath),
  resolveAttachment: (filename) => ipcRenderer.invoke("resolve-attachment", filename),
  getFileSize: (filename) => ipcRenderer.invoke("get-file-size", filename),
  copyImageToClipboard: (filename) => ipcRenderer.invoke("copy-image-to-clipboard", filename),
  readMeta: (folderRelPath) => ipcRenderer.invoke("read-meta", folderRelPath),
  writeMeta: (folderRelPath, meta) => ipcRenderer.invoke("write-meta", folderRelPath, meta),

  // Trash
  trashNote: (noteId, title, folder) => ipcRenderer.invoke("trash-note", noteId, title, folder),
  readTrash: () => ipcRenderer.invoke("read-trash"),
  restoreNote: (noteId) => ipcRenderer.invoke("restore-note", noteId),
  purgeTrash: (noteIds) => ipcRenderer.invoke("purge-trash", noteIds),
  emptyTrash: () => ipcRenderer.invoke("empty-trash"),

  onFileChanged: (callback) => {
    const handler = (_event, note) => callback(note);
    ipcRenderer.on("file-changed", handler);
    return () => ipcRenderer.removeListener("file-changed", handler);
  },

  onFileDeleted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("file-deleted", handler);
    return () => ipcRenderer.removeListener("file-deleted", handler);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSetting: (key, value) => ipcRenderer.invoke("set-setting", key, value),
  toggleSpellcheck: (opts) => ipcRenderer.invoke("toggle-spellcheck", opts),

  // Export
  exportPdf: (data) => ipcRenderer.invoke("export:pdf", data),
  exportDocx: (data) => ipcRenderer.invoke("export:docx", data),
  onMenuExport: (callback) => {
    const handler = (_event, fmt) => callback(fmt);
    ipcRenderer.on("menu:export", handler);
    return () => ipcRenderer.removeListener("menu:export", handler);
  },

  // Import
  importMarkdown: (opts) => ipcRenderer.invoke("import:markdown", opts),
  importHtml: (opts) => ipcRenderer.invoke("import:html", opts),
  importFolder: (opts) => ipcRenderer.invoke("import:folder", opts),
  onMenuImport: (callback) => {
    const handler = (_event, fmt) => callback(fmt);
    ipcRenderer.on("menu:import", handler);
    return () => ipcRenderer.removeListener("menu:import", handler);
  },

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  setAutoUpdate: (enabled) => ipcRenderer.invoke("set-auto-update", enabled),
  getAutoUpdate: () => ipcRenderer.invoke("get-auto-update"),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },

  // Window
  setWindowTitle: (title) => ipcRenderer.send("set-window-title", title),

  // Terminal
  terminal: {
    create: (opts) => ipcRenderer.invoke("terminal:create", opts),
    write: (id, data) => ipcRenderer.send("terminal:write", { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send("terminal:resize", { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke("terminal:kill", id),
    killAll: () => ipcRenderer.invoke("terminal:kill-all"),
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    },
  },
});
