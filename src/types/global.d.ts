/// <reference types="vite/client" />

// Truthful mirror of electron/preload.js — every member below exists on the
// bridge, with argument and return shapes taken from the ipcMain handlers.
// When the preload changes, change this file in the same commit.

import type { Note } from "./notes";

/** userData/settings.json — known keys plus whatever set-setting has stored. */
interface DesktopSettings {
  spellCheckEnabled?: boolean;
  spellCheckLanguages?: string[];
  autoUpdateEnabled?: boolean;
  [key: string]: unknown;
}

/** Payloads of the update-status event and get-update-status. */
interface UpdateStatus {
  state: "idle" | "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

/** Every subscriber returns an unsubscribe function. */
type Unsubscribe = () => void;

declare global {
  interface Window {
    /** Present on desktop only — the contextBridge API from electron/preload.js. */
    electronAPI?: {
      // Files / vault
      getNotesDir: () => Promise<string>;
      chooseNotesDir: () => Promise<string | null>;
      readAllNotes: () => Promise<Record<string, Note>>;
      /** `title` is the basename the file actually got, which the title adopts. */
      writeNote: (note: Note) => Promise<{ filePath: string; title: string }>;
      saveImage: (data: { fileName: string; dataBase64: string }) => Promise<string>;
      saveAttachment: (data: {
        fileName: string;
        dataBase64: string;
      }) => Promise<{ filename: string; size: number }>;
      pickImageFile: () => Promise<{ fileName: string; dataBase64: string } | null>;
      pickFile: () => Promise<{ fileName: string; dataBase64: string; size: number } | null>;
      openExternal: (url: string) => Promise<void>;
      openPath: (absolutePath: string) => Promise<void>;
      showItemInFolder: (absolutePath: string) => Promise<void>;
      resolveAttachment: (filename: string) => Promise<string | null>;
      getFileSize: (filename: string) => Promise<number | null>;
      copyImageToClipboard: (filename: string) => Promise<boolean>;

      // Platform Trash / Recycle Bin
      trashNote: (noteId: string) => Promise<{ trashed: boolean; missing?: boolean }>;

      // Folders are directories. Vault-relative `/` paths; each mutation
      // answers with the path the disk holds (sanitised, de-duplicated).
      readFolders: () => Promise<string[]>;
      createFolder: (relPath: string) => Promise<{ path: string }>;
      /** Rename (new name, same parent) or move (new parent) in one directory rename. */
      renameFolder: (oldRelPath: string, newRelPath: string) => Promise<{ path: string }>;
      /** Removes the directory only if nothing but OS cruft is left in it. */
      deleteFolder: (relPath: string) => Promise<{ removed: boolean }>;
      /** A directory appeared or vanished outside the app; re-read the folder list. */
      onFoldersChanged: (callback: () => void) => Unsubscribe;

      // File watcher events
      onFileChanged: (callback: (note: Note) => void) => Unsubscribe;
      onFileDeleted: (callback: (data: { filePath: string }) => void) => Unsubscribe;

      // Quit/close flush handshake
      onAppWillClose: (callback: () => void) => Unsubscribe;
      flushBeforeCloseDone: () => void;

      // Settings (each mutation returns the full settings object)
      getSettings: () => Promise<DesktopSettings>;
      setSetting: (key: string, value: unknown) => Promise<DesktopSettings>;
      toggleSpellcheck: (opts: {
        enabled: boolean;
        languages?: string[];
      }) => Promise<DesktopSettings>;

      // Import (returns absolute paths of the files written into the vault)
      importMarkdown: (opts?: { targetFolder?: string }) => Promise<{ imported: string[] }>;
      importHtml: (opts?: { targetFolder?: string }) => Promise<{ imported: string[] }>;
      importFolder: (opts?: { targetFolder?: string }) => Promise<{ imported: string[] }>;
      onMenuImport: (callback: (format: string) => void) => Unsubscribe;

      // Auto-update
      checkForUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getUpdateStatus: () => Promise<UpdateStatus>;
      setAutoUpdate: (enabled: boolean) => Promise<DesktopSettings>;
      getAutoUpdate: () => Promise<boolean>;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => Unsubscribe;

      // Window
      setWindowTitle: (title: string) => void;
    };
  }
}
