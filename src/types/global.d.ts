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
    readMeta: (folder: string) => Promise<any>;
    writeMeta: (folder: string, data: any) => Promise<void>;
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
    [key: string]: any;
  };
}
