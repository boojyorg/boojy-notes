const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
  deleteNoteFile: (noteId) => ipcRenderer.invoke("delete-note-file", noteId),
  saveImage: (data) => ipcRenderer.invoke("save-image", data),
  pickImageFile: () => ipcRenderer.invoke("pick-image-file"),
  readMeta: (folderRelPath) => ipcRenderer.invoke("read-meta", folderRelPath),
  writeMeta: (folderRelPath, meta) => ipcRenderer.invoke("write-meta", folderRelPath, meta),

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
});
