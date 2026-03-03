const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
  deleteNoteFile: (noteId) => ipcRenderer.invoke("delete-note-file", noteId),
  saveImage: (data) => ipcRenderer.invoke("save-image", data),
  pickImageFile: () => ipcRenderer.invoke("pick-image-file"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
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
