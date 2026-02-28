const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
  deleteNoteFile: (noteId) => ipcRenderer.invoke("delete-note-file", noteId),

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
