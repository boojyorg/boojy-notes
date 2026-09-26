const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  // The vaults the app has opened (electron/vaults.ts); one is open at a time.
  listVaults: () => ipcRenderer.invoke("list-vaults"),
  openVault: (dir) => ipcRenderer.invoke("open-vault", dir),
  forgetVault: (dir) => ipcRenderer.invoke("forget-vault", dir),
  addVault: () => ipcRenderer.invoke("add-vault"),
  revealVault: (dir) => ipcRenderer.invoke("reveal-vault", dir),
  // First-run setup: shown only on a launch that has never had a folder.
  getSetupState: () => ipcRenderer.invoke("get-setup-state"),
  // Ends setup however it ended; answers with the folder, made if it is the default.
  completeSetup: () => ipcRenderer.invoke("complete-setup"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
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
  // Pastes into the focused element, as ⌘V does (the editor's right-click Paste).
  paste: () => ipcRenderer.invoke("paste"),
  // The application menu (electron/appMenu.ts): its items arrive as command
  // ids, and the window tells it what can act so it greys what cannot.
  onMenuCommand: (callback) => {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on("menu-command", handler);
    return () => ipcRenderer.removeListener("menu-command", handler);
  },
  setMenuState: (state) => ipcRenderer.send("menu-state", state),
  // Show a note's file in Finder or Explorer, by its id.
  revealNote: (noteId) => ipcRenderer.invoke("reveal-note", noteId),

  // Move Boojy-managed Markdown files to the platform Trash / Recycle Bin.
  trashNote: (noteId) => ipcRenderer.invoke("trash-note", noteId),
  listDeletedNotes: () => ipcRenderer.invoke("list-deleted-notes"),
  restoreDeletedNote: (noteId) => ipcRenderer.invoke("restore-deleted-note", noteId),
  purgeDeletedNote: (noteId) => ipcRenderer.invoke("purge-deleted-note", noteId),
  onDeletedNotesChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("deleted-notes-changed", handler);
    return () => ipcRenderer.removeListener("deleted-notes-changed", handler);
  },
  history: {
    savePoint: (noteId) => ipcRenderer.invoke("history-save-point", noteId),
    name: (noteId, versionId, name) => ipcRenderer.invoke("history-name", noteId, versionId, name),
    mark: (noteId, reason) => ipcRenderer.invoke("history-mark", noteId, reason),
    leave: (noteId) => ipcRenderer.invoke("history-leave", noteId),
    list: (noteId) => ipcRenderer.invoke("history-list", noteId),
    read: (noteId, versionId) => ipcRenderer.invoke("history-read", noteId, versionId),
    remove: (noteId, versionId) => ipcRenderer.invoke("history-delete", noteId, versionId),
    setOff: (noteId, off, keep) => ipcRenderer.invoke("history-set-off", noteId, off, keep),
    undelete: (noteId, version) => ipcRenderer.invoke("history-undelete", noteId, version),
    clock24h: () => ipcRenderer.invoke("history-clock-24h"),
  },
  // A file that is not a note, by its vault-relative path.
  trashFile: (relPath) => ipcRenderer.invoke("trash-file", relPath),

  // Folders are directories. Paths are vault-relative with `/` separators;
  // each mutation answers with the path the disk actually holds.
  readFolders: () => ipcRenderer.invoke("read-folders"),
  // Every file that is not a note: `{ path, attachment }`, vault-relative.
  readOtherFiles: () => ipcRenderer.invoke("read-other-files"),
  createFolder: (relPath) => ipcRenderer.invoke("create-folder", relPath),
  renameFolder: (oldRelPath, newRelPath) =>
    ipcRenderer.invoke("rename-folder", oldRelPath, newRelPath),
  deleteFolder: (relPath) => ipcRenderer.invoke("delete-folder", relPath),
  // One directory copy beside the original; answers with the copy's path,
  // its folders and its notes read from disk.
  duplicateFolder: (relPath) => ipcRenderer.invoke("duplicate-folder", relPath),
  onFoldersChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("folders-changed", handler);
    return () => ipcRenderer.removeListener("folders-changed", handler);
  },

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

  // A note renamed or moved outside the app: the same note, as the disk now
  // holds it (its new title and folder).
  onFileMoved: (callback) => {
    const handler = (_event, note) => callback(note);
    ipcRenderer.on("file-moved", handler);
    return () => ipcRenderer.removeListener("file-moved", handler);
  },

  // Quit/close flush handshake: main holds the window close until the renderer
  // has flushed pending edits to disk (or main's 2s timeout fires)
  onAppWillClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("app-will-close", handler);
    return () => ipcRenderer.removeListener("app-will-close", handler);
  },
  flushBeforeCloseDone: () => ipcRenderer.send("flush-before-close-done"),

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  setAutoUpdate: (enabled) => ipcRenderer.invoke("set-auto-update", enabled),
  getAutoUpdate: () => ipcRenderer.invoke("get-auto-update"),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },

  // Window
  setWindowTitle: (title) => ipcRenderer.send("set-window-title", title),
  // macOS full screen hides the traffic lights; the renderer drops the inset
  // that clears them while it is on. One answer at mount, then every edge.
  isFullScreen: () => ipcRenderer.invoke("is-full-screen"),
  onFullScreenChanged: (callback) => {
    const handler = (_event, on) => callback(on);
    ipcRenderer.on("full-screen-changed", handler);
    return () => ipcRenderer.removeListener("full-screen-changed", handler);
  },

  // Diagnostic trace (electron/trace.js): a no-op unless BOOJY_TRACE is set.
  traceEnabled: ipcRenderer.sendSync("trace-enabled"),
  trace: (line) => ipcRenderer.send("trace", line),
});
