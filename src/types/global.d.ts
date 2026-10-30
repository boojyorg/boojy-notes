/// <reference types="vite/client" />

// Truthful mirror of electron/preload.js — every member below exists on the
// bridge, with argument and return shapes taken from the ipcMain handlers
// (imported from them where the main process declares one). When the preload
// changes, change this file in the same commit.

import type { MenuState } from "../../electron/appMenu";
import type { OpenRequest } from "../../electron/openRequests";
import type { OtherFile } from "../../electron/folders";
import type { Version } from "../../electron/history";
import type { SpellingState } from "../../electron/spelling";
import type { VaultEntry } from "../../electron/vaults";
import type { Note } from "./notes";

export type { OtherFile, SpellingState, VaultEntry };

/** userData/settings.json. */
interface DesktopSettings {
  spellCheckEnabled?: boolean;
  spellCheckLanguages?: string[];
  autoUpdateEnabled?: boolean;
  [key: string]: unknown;
}

/** One version in a note's history, as the list shows it. */
export type HistoryVersion = Omit<Version, "src">;

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
      /** The vault's name in the app alone (empty clears it); the folder keeps its own. */
      renameVault: (dir: string, name: string) => Promise<VaultEntry[]>;
      /** The picker, then the list gains the folder; the open vault stays open. */
      addVault: () => Promise<VaultEntry[]>;
      revealVault: (dir: string) => Promise<void>;
      /** First-run setup: `firstRun` only on a launch that has never had a folder. */
      getSetupState: () => Promise<{ firstRun: boolean }>;
      /** Ends setup however it ended; answers with the notes folder, made if it is the default. */
      completeSetup: () => Promise<string>;
      readAllNotes: () => Promise<Record<string, Note>>;
      /** Notes opened from outside the app (electron/openRequests.ts): those held until now, then each as it comes. */
      takeOpenRequests: () => Promise<OpenRequest[]>;
      onOpenRequest: (callback: (request: OpenRequest) => void) => Unsubscribe;
      /** The id of the note at a path in the open storage location (the index's spelling), or null. */
      noteIdAt: (rel: string) => Promise<string | null>;
      /** A note outside every storage location (electron/outsideNotes.ts): opened, or why not. */
      openOutsideNote: (
        filePath: string,
      ) => Promise<{ note?: Note; id?: string; error?: "missing" | "unreadable" }>;
      writeOutsideNote: (
        note: Note,
      ) => Promise<{ filePath: string; title: string; stale?: boolean; note?: Note }>;
      /** An outside note's file deleted, or moved out of its folder. */
      onOutsideNoteGone: (callback: (gone: { id: string; title: string }) => void) => Unsubscribe;
      /** `title` is the basename the file actually got, which the title adopts. */
      /**
       * Writes the note and answers with the name the file got. Refused, and
       * nothing written, when the file changed since the app last read or
       * wrote it: `stale` carries the disk version as an outside change.
       */
      writeNote: (
        note: Note,
      ) => Promise<
        | { filePath: string; title: string; stale?: undefined; downloaded?: Note }
        | { stale: true; note: Note }
      >;
      /** An offloaded note's text, downloaded; null when it could not be. */
      downloadNote: (id: string) => Promise<Note | null>;
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
      /** The vault path of the file an embed names, read from its note's folder (`attachmentPath.ts`). */
      locateAttachment: (
        src: string,
        noteFolder: string | null,
        markdown?: boolean,
      ) => Promise<string | null>;
      /** Picks a missing attachment and copies it in under `filename`; false when cancelled. */
      findAttachment: (src: string, markdown?: boolean) => Promise<boolean>;
      getFileSize: (filename: string) => Promise<number | null>;
      copyImageToClipboard: (filename: string) => Promise<boolean>;
      /** A note's Markdown as plain text, with HTML for apps that take formatting. */
      copyTextToClipboard: (payload: { text: string; html?: string }) => Promise<boolean>;
      paste: () => Promise<void>;
      /** Null when the word is spelled right, else up to three guesses. */
      checkSpelling: (word: string, paragraph: string) => Promise<string[] | null>;
      /** Each paragraph's misspelled words, for the app's underline; absent on Windows, where it is Chromium's. */
      checkParagraphs?: (texts: string[]) => Promise<string[][]>;
      /** Windows: a right-click's spelling comes with the menu event, which must not be cancelled. */
      spellingFromMenu: boolean;
      getSpelling: () => Promise<SpellingState>;
      setSpelling: (change: { enabled?: boolean; languages?: string[] }) => Promise<SpellingState>;
      addDictionaryWord: (word: string) => Promise<boolean>;
      /** A spelling dictionary finished loading (off a Mac): what was checked before is stale. */
      onSpellingReady: (callback: () => void) => Unsubscribe;
      removeDictionaryWord: (word: string) => Promise<boolean>;
      openKeyboardSettings: () => Promise<void>;
      onMenuCommand: (callback: (id: string) => void) => () => void;
      setMenuState: (state: MenuState) => void;
      /** Windows and Linux: the application menu's names, for the app's own strip. */
      menuLabels: () => Promise<string[]>;
      /**
       * Opens that menu at the window point `x`, `y` (viewport pixels). `titles`, the
       * strip's names where they sit, let the pointer move the menu to another name.
       */
      popupMenu: (
        label: string,
        x: number,
        y: number,
        titles?: { label: string; left: number; top: number; right: number; bottom: number }[],
      ) => void;
      onMenuClosed: (callback: (label: string) => void) => () => void;
      onMenuOpened: (callback: (label: string) => void) => () => void;
      /** The window buttons' ground and ink, drawn over the strip's right end. */
      setTitleBarOverlay: (colors: { color: string; symbolColor: string }) => void;
      /** The system's surfaces (menus, dialogs, full screen's strip) take the app's theme. */
      setNativeTheme: (mode: "day" | "night" | "auto") => void;
      revealNote: (noteId: string) => Promise<void>;

      // Platform Trash / Recycle Bin
      trashNote: (noteId: string) => Promise<{ trashed: boolean; missing?: boolean }>;
      /** Recently Deleted: notes the app sent to the Trash in the last 30 days. */
      listDeletedNotes: () => Promise<{ id: string; name: string; folder: string; at: number }[]>;
      restoreDeletedNote: (noteId: string) => Promise<Note | null>;
      purgeDeletedNote: (noteId: string) => Promise<boolean>;
      /** A deleted note's last text, to look at; null once it is gone for good. */
      readDeletedNote: (noteId: string) => Promise<string | null>;
      onDeletedNotesChanged: (callback: () => void) => () => void;
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
      readVaultFile: (relPath: string) => Promise<Uint8Array | null>;

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
      onAttachmentsChanged: (callback: () => void) => Unsubscribe;

      // File watcher events
      onFileChanged: (callback: (note: Note) => void) => Unsubscribe;
      /** Diagnostic trace (electron/trace.js); `trace` is a no-op unless enabled. */
      traceEnabled: boolean;
      trace: (line: string) => void;
      onFileDeleted: (callback: (data: { filePath: string }) => void) => Unsubscribe;
      /** A note renamed or moved outside the app, as the disk now holds it. */
      onFileMoved: (callback: (note: Note) => void) => Unsubscribe;
      /** The window has taken up a note's new name after an outside move. */
      outsideMoveTaken: (noteId: string) => Promise<void>;

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
    /** The Android app's vault (src/phone/install.ts): the note-file calls of `electronAPI`. */
    boojyPhoneAPI?: import("../phone/phoneVault").PhoneVaultAPI & {
      /** The bar above the keyboard's commands (src/phone/commands.ts). */
      onMenuCommand: (listener: (id: string) => void) => () => void;
      /** The system's long-press tap, as a block hold is recognised (src/phone/haptics.ts). */
      holdFelt: () => void;
      /** A finger's long press on the word at a point, for a double-tap that missed it (src/phone/selectWord.ts). */
      selectWordAt: (x: number, y: number) => Promise<void>;
      /** Where the page loads the vault's files from (src/utils/attachmentUrl.js). */
      vaultAddress: string;
      /** Sync's state, for Home's folder row (src/phone/useSyncStatus.ts). */
      sync: import("../phone/useSyncStatus").PhoneSyncAPI;
    };
    /** Capacitor's bridge, present in the Android app before any script runs. */
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}
