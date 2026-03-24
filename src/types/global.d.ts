/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    saveImage: (noteId: string, dataUrl: string) => Promise<string>;
    saveAttachment: (noteId: string, name: string, data: ArrayBuffer) => Promise<{ filename: string; size: number }>;
    getFileSize: (filename: string) => Promise<number>;
    openExternal: (url: string) => void;
    showItemInFolder: (path: string) => void;
    onMenuAction: (callback: (action: string) => void) => () => void;
    onMenuExport?: (callback: (format: string) => void) => () => void;
    onMenuImport?: (callback: (format: string) => void) => () => void;
    importMarkdown: (opts?: { targetFolder?: string }) => void;
    importHtml: () => void;
    importFolder: () => void;
    exportPdf: (opts: { html: string; title: string }) => void;
    exportDocx: (opts: { blocks: Block[]; title: string }) => void;
    readNotes: () => Promise<Record<string, NoteData>>;
    writeNote: (id: string, note: NoteData) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    readTrash: () => Promise<Record<string, NoteData>>;
    purgeTrash: (days: number | null) => Promise<void>;
    readMeta: (folder: string) => Promise<Record<string, string[]> | null>;
    writeMeta: (folder: string, data: Record<string, string[]>) => Promise<void>;
    setWindowTitle: (title: string) => void;
    setSpellCheck: (enabled: boolean, languages: string[]) => void;
    getSpellCheckState: () => Promise<{ enabled: boolean; languages: string[] }>;
    setAutoUpdate: (enabled: boolean) => void;
    checkForUpdates: () => void;
    onUpdateStatus: (callback: (status: string) => void) => () => void;
    secureStore: (key: string, value: string) => Promise<void>;
    secureRead: (key: string) => Promise<string | null>;
    secureDelete: (key: string) => Promise<void>;
    createTerminal: (id: string) => void;
    writeTerminal: (id: string, data: string) => void;
    resizeTerminal: (id: string, cols: number, rows: number) => void;
    onTerminalData: (callback: (id: string, data: string) => void) => () => void;
    onTerminalExit: (callback: (id: string, code: number) => void) => () => void;
    killTerminal: (id: string) => void;
    secureStorage?: {
      store: (key: string, value: string) => Promise<void>;
      read: (key: string) => Promise<string | null>;
      delete: (key: string) => Promise<void>;
    };
    terminal?: {
      create: (opts: { cols?: number; rows?: number; cwd?: string }) => Promise<{ id: string }>;
      write: (id: string, data: string) => void;
      resize: (id: string, cols: number, rows: number) => void;
      kill: (id: string) => Promise<void>;
      killAll: () => Promise<void>;
      onData: (callback: (payload: { id: string; data: string }) => void) => () => void;
      onExit: (callback: (payload: { id: string; code: number }) => void) => () => void;
    };
    getNotesDir?: () => Promise<string>;
    chooseNotesDir?: () => Promise<string | null>;
    readAllNotes?: () => Promise<Record<string, unknown>>;
    writeNote?: (note: unknown) => Promise<void>;
    deleteNoteFile?: (noteId: string) => Promise<void>;
    pickImageFile?: () => Promise<{ fileName: string; dataBase64: string } | null>;
    pickFile?: () => Promise<{ fileName: string; dataBase64: string; size: number } | null>;
    resolveAttachment?: (filename: string) => Promise<string | null>;
    copyImageToClipboard?: (filename: string) => Promise<void>;
    openPath?: (absolutePath: string) => Promise<void>;
    trashNote?: (noteId: string, title: string, folder: string) => Promise<void>;
    restoreNote?: (noteId: string) => Promise<unknown>;
    emptyTrash?: () => Promise<void>;
    onFileChanged?: (callback: (note: unknown) => void) => () => void;
    onFileDeleted?: (callback: (data: unknown) => void) => () => void;
    getSettings?: () => Promise<Record<string, unknown>>;
    setSetting?: (key: string, value: unknown) => Promise<void>;
    toggleSpellcheck?: (opts: unknown) => Promise<void>;
    checkForUpdate?: () => Promise<void>;
    installUpdate?: () => Promise<void>;
    getUpdateStatus?: () => Promise<string>;
    getAutoUpdate?: () => Promise<boolean>;
  };
}
