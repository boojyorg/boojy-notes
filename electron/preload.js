const { contextBridge, ipcRenderer, webFrame } = require("electron");

// An event from the main process, as `onX(callback)`: the callback gets the
// event's payload and the call returns the unsubscribe.
const subscribe = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("electronAPI", {
  getNotesDir: () => ipcRenderer.invoke("get-notes-dir"),
  chooseNotesDir: () => ipcRenderer.invoke("choose-notes-dir"),
  // The vaults the app has opened (electron/vaults.ts); one is open at a time.
  listVaults: () => ipcRenderer.invoke("list-vaults"),
  openVault: (dir) => ipcRenderer.invoke("open-vault", dir),
  forgetVault: (dir) => ipcRenderer.invoke("forget-vault", dir),
  renameVault: (dir, name) => ipcRenderer.invoke("rename-vault", dir, name),
  addVault: () => ipcRenderer.invoke("add-vault"),
  revealVault: (dir) => ipcRenderer.invoke("reveal-vault", dir),
  // First-run setup: shown only on a launch that has never had a folder.
  getSetupState: () => ipcRenderer.invoke("get-setup-state"),
  // Ends setup however it ended; answers with the folder, made if it is the default.
  completeSetup: () => ipcRenderer.invoke("complete-setup"),
  readAllNotes: () => ipcRenderer.invoke("read-all-notes"),
  writeNote: (note) => ipcRenderer.invoke("write-note", note),
  findAttachment: (filename) => ipcRenderer.invoke("find-attachment", filename),
  downloadNote: (id) => ipcRenderer.invoke("download-note", id),
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
  copyTextToClipboard: (payload) => ipcRenderer.invoke("copy-text-to-clipboard", payload),
  // Pastes into the focused element, as ⌘V does (the editor's right-click Paste).
  paste: () => ipcRenderer.invoke("paste"),
  // Spelling (electron/spelling.ts). A Mac is asked through the main process,
  // in each paragraph's language; on Windows the right-click's menu event
  // answers (Windows' own checker, which takes no question); elsewhere the
  // window's own checker answers, in the chosen languages, less the words
  // added to the dictionary (Linux hands an added word to this checker late).
  // A word's check: null when spelled right, else its first three guesses.
  checkSpelling: async (word, paragraph) => {
    if (process.platform === "darwin") return ipcRenderer.invoke("check-spelling", word, paragraph);
    if (process.platform === "win32") {
      const menu = await ipcRenderer.invoke("menu-spelling");
      return menu?.word === word ? menu.suggestions : null;
    }
    if (!webFrame.isWordMisspelled(word)) return null;
    if ((await ipcRenderer.invoke("learned-words")).includes(word)) return null;
    return webFrame.getWordSuggestions(word).slice(0, 3);
  },
  // On Windows the right-click asks the menu event, so the editor must let
  // that event happen; the underline there is Chromium's own.
  spellingFromMenu: process.platform === "win32",
  // Each paragraph's misspelled words, for the app's underline (not on Windows).
  checkParagraphs:
    process.platform === "win32"
      ? undefined
      : async (texts) => {
          if (process.platform === "darwin") return ipcRenderer.invoke("check-paragraphs", texts);
          const learned = new Set(await ipcRenderer.invoke("learned-words"));
          const words = new Intl.Segmenter(undefined, { granularity: "word" });
          return texts.map((text) => {
            const seen = new Set();
            for (const seg of words.segment(text)) {
              if (seg.isWordLike && !learned.has(seg.segment)) seen.add(seg.segment);
            }
            return [...seen].filter((w) => webFrame.isWordMisspelled(w));
          });
        },
  getSpelling: () => ipcRenderer.invoke("get-spelling"),
  setSpelling: (change) => ipcRenderer.invoke("set-spelling", change),
  addDictionaryWord: (word) => ipcRenderer.invoke("add-dictionary-word", word),
  removeDictionaryWord: (word) => ipcRenderer.invoke("remove-dictionary-word", word),
  // A dictionary finished loading after the note was checked (off a Mac).
  onSpellingReady: subscribe("spelling-ready"),
  openKeyboardSettings: () => ipcRenderer.invoke("open-keyboard-settings"),
  // The application menu (electron/appMenu.ts): its items arrive as command
  // ids, and the window tells it what can act so it greys what cannot.
  onMenuCommand: subscribe("menu-command"),
  setMenuState: (state) => ipcRenderer.send("menu-state", state),
  // Windows and Linux: the app's own menu strip (WindowStrip).
  menuLabels: () => ipcRenderer.invoke("menu-labels"),
  popupMenu: (label, x, y, titles) => ipcRenderer.send("popup-menu", { label, x, y, titles }),
  onMenuClosed: subscribe("menu-closed"),
  // The pointer crossed the strip to another name: that menu is open now.
  onMenuOpened: subscribe("menu-opened"),
  setTitleBarOverlay: (colors) => ipcRenderer.send("set-title-bar-overlay", colors),
  // Show a note's file in Finder or Explorer, by its id.
  revealNote: (noteId) => ipcRenderer.invoke("reveal-note", noteId),

  // Move Boojy-managed Markdown files to the platform Trash / Recycle Bin.
  trashNote: (noteId) => ipcRenderer.invoke("trash-note", noteId),
  listDeletedNotes: () => ipcRenderer.invoke("list-deleted-notes"),
  restoreDeletedNote: (noteId) => ipcRenderer.invoke("restore-deleted-note", noteId),
  purgeDeletedNote: (noteId) => ipcRenderer.invoke("purge-deleted-note", noteId),
  readDeletedNote: (noteId) => ipcRenderer.invoke("read-deleted-note", noteId),
  onDeletedNotesChanged: subscribe("deleted-notes-changed"),
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
  onFoldersChanged: subscribe("folders-changed"),

  onFileChanged: subscribe("file-changed"),

  onFileDeleted: subscribe("file-deleted"),

  // A note renamed or moved outside the app: the same note, as the disk now
  // holds it (its new title and folder).
  onFileMoved: subscribe("file-moved"),

  // Quit/close flush handshake: main holds the window close until the renderer
  // has flushed pending edits to disk (or main's 2s timeout fires)
  onAppWillClose: subscribe("app-will-close"),
  flushBeforeCloseDone: () => ipcRenderer.send("flush-before-close-done"),

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  setAutoUpdate: (enabled) => ipcRenderer.invoke("set-auto-update", enabled),
  getAutoUpdate: () => ipcRenderer.invoke("get-auto-update"),
  onUpdateStatus: subscribe("update-status"),

  // Window
  setWindowTitle: (title) => ipcRenderer.send("set-window-title", title),
  // macOS full screen hides the traffic lights; the renderer drops the inset
  // that clears them while it is on. One answer at mount, then every edge.
  isFullScreen: () => ipcRenderer.invoke("is-full-screen"),
  onFullScreenChanged: subscribe("full-screen-changed"),

  // Diagnostic trace (electron/trace.js): a no-op unless BOOJY_TRACE is set.
  traceEnabled: ipcRenderer.sendSync("trace-enabled"),
  trace: (line) => ipcRenderer.send("trace", line),
});
