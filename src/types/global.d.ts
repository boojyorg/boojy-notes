/// <reference types="vite/client" />

// Truthful mirror of electron/preload.js — every member below exists on the
// bridge, with argument and return shapes taken from the ipcMain handlers.
// When the preload changes, change this file in the same commit.

import type { Note } from "./notes";

/** userData/settings.json. */
interface DesktopSettings {
  spellCheckEnabled?: boolean;
  spellCheckLanguages?: string[];
  autoUpdateEnabled?: boolean;
  [key: string]: unknown;
}

/** One version in a note's history (electron/history.ts), without its text. */
export interface HistoryVersion {
  id: string;
  at: number;
  kind: "auto" | "point";
  hash: string;
  name?: string;
  reason?: string;
}

/** One vault the app has opened (electron/vaults.ts). */
export interface VaultEntry {
  path: string;
  name: string;
  current: boolean;
  exists: boolean;
  cloud: boolean;
}

/** A file in the vault that is not a note (electron/folders.ts). */
export interface OtherFile {
  path: string;
  attachment: boolean;
}

/** Payload of the update-status event. */
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
      listVaults: () => Promise<VaultEntry[]>;
      /** Only a vault already listed and present; null otherwise. */
      openVault: (dir: string) => Promise<string | null>;
      forgetVault: (dir: string) => Promise<VaultEntry[]>;
      /** The picker, then the list gains the folder; the open vault stays open. */
      addVault: () => Promise<VaultEntry[]>;
      revealVault: (dir: string) => Promise<void>;
      /** First-run setup: `firstRun` only on a launch that has never had a folder. */
      getSetupState: () => Promise<{ firstRun: boolean }>;
      /** Ends setup however it ended; answers with the notes folder, made if it is the default. */
      completeSetup: () => Promise<string>;
      readAllNotes: () => Promise<Record<string, Note>>;
      /** `title` is the basename the file actually got, which the title adopts. */
      /**
       * Writes the note and answers with the name the file got. Refused, and
       * nothing written, when the file changed since the app last read or
       * wrote it: `stale` carries the disk version as an outside change.
       */
      writeNote: (
        note: Note,
      ) => Promise<
        { filePath: string; title: string; stale?: undefined } | { stale: true; note: Note }
      >;
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
      paste: () => Promise<void>;
      onMenuCommand: (callback: (id: string) => void) => () => void;
      setMenuState: (state: {
        hasNote: boolean;
        hasFile: boolean;
        canUndo: boolean;
        canRedo: boolean;
        textField: boolean;
        formats: string[];
        kind: string | null;
        align: string | null;
        sidebarVisible: boolean;
        sourceView: boolean;
        vaults: { name: string; path: string; current: boolean; exists: boolean }[];
      }) => void;
      revealNote: (noteId: string) => Promise<void>;

      // Platform Trash / Recycle Bin
      trashNote: (noteId: string) => Promise<{ trashed: boolean; missing?: boolean }>;
      /** Version history (electron/history.ts): a note's past, kept outside the vault. */
      history: {
        savePoint: (
          noteId: string,
        ) => Promise<
          | { ok: true; id: string; at: number }
          | { ok: false; reason: "off" | "nothing" | "unknown"; at?: number }
        >;
        name: (noteId: string, versionId: string, name: string) => Promise<boolean>;
        mark: (noteId: string, reason: "Before Replace All" | "Before restore") => Promise<void>;
        leave: (noteId: string) => Promise<void>;
        list: (noteId: string) => Promise<{
          versions: HistoryVersion[];
          off: boolean;
        }>;
        read: (noteId: string, versionId: string) => Promise<string | null>;
        remove: (noteId: string, versionId: string) => Promise<boolean>;
        setOff: (noteId: string, off: boolean, keep?: boolean) => Promise<void>;
        undelete: (noteId: string, version: HistoryVersion) => Promise<boolean>;
        clock24h: () => Promise<boolean | null>;
      };
      trashFile: (relPath: string) => Promise<{ trashed: boolean }>;

      // Folders are directories. Vault-relative `/` paths; each mutation
      // answers with the path the disk holds (sanitised, de-duplicated).
      readFolders: () => Promise<string[]>;
      readOtherFiles: () => Promise<OtherFile[]>;
      createFolder: (relPath: string) => Promise<{ path: string }>;
      /** Rename (new name, same parent) or move (new parent) in one directory rename. */
      renameFolder: (oldRelPath: string, newRelPath: string) => Promise<{ path: string }>;
      /** Removes the directory only if nothing but OS cruft is left in it. */
      deleteFolder: (relPath: string) => Promise<{ removed: boolean }>;
      /** Copies the directory beside itself as `Name (copy)`, everything in it
       * included; the copied notes come back read from disk with their own ids. */
      duplicateFolder: (
        relPath: string,
      ) => Promise<{ path: string; folders: string[]; notes: Note[] }>;
      /** A directory appeared or vanished outside the app; re-read the folder list. */
      onFoldersChanged: (callback: () => void) => Unsubscribe;

      // File watcher events
      onFileChanged: (callback: (note: Note) => void) => Unsubscribe;
      /** Diagnostic trace (electron/trace.js); `trace` is a no-op unless enabled. */
      traceEnabled: boolean;
      trace: (line: string) => void;
      onFileDeleted: (callback: (data: { filePath: string }) => void) => Unsubscribe;
      /** A note renamed or moved outside the app, as the disk now holds it. */
      onFileMoved: (callback: (note: Note) => void) => Unsubscribe;

      // Quit/close flush handshake
      onAppWillClose: (callback: () => void) => Unsubscribe;
      flushBeforeCloseDone: () => void;

      // Auto-update (each mutation returns the full settings object)
      checkForUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      setAutoUpdate: (enabled: boolean) => Promise<DesktopSettings>;
      getAutoUpdate: () => Promise<boolean>;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => Unsubscribe;

      // Window
      setWindowTitle: (title: string) => void;
      /** Whether the window is in macOS full screen now (the traffic lights are hidden). */
      isFullScreen: () => Promise<boolean>;
      /** Every enter or leave of full screen after `isFullScreen` answered. */
      onFullScreenChanged: (callback: (on: boolean) => void) => Unsubscribe;
    };
  }
}
