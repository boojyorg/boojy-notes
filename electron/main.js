import { app, BrowserWindow, Menu, protocol, net, nativeTheme, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerNoteFileIPC } from "./noteFileManager.js";
import { migrateLegacyTrash, registerOSTrashIPC } from "./osTrash.js";
import { startWatcher, suppressWatcher, closeWatcher } from "./fileWatcher.js";
import {
  getNotesDir,
  loadSettings,
  setupAutoUpdater,
  registerSettingsIPC,
  checkForUpdatesOnStartup,
} from "./settingsManager.js";
import { registerSecureStorageIPC } from "./secureStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Window ───

let mainWindow = null;
let isQuitting = false;

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: "Boojy Notes",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 8 },
    backgroundColor: "#2C2C32",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Hold the close (Cmd+W or quit) until the renderer flushes pending edits to
  // disk, so quitting right after typing can't lose the last keystrokes. The 2s
  // cap means a hung renderer can never trap the user in the app.
  let flushedBeforeClose = false;
  mainWindow.on("close", (e) => {
    if (flushedBeforeClose) return;
    e.preventDefault();
    const win = mainWindow;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ipcMain.removeListener("flush-before-close-done", finish);
      flushedBeforeClose = true;
      if (isQuitting) {
        app.quit();
      } else if (win && !win.isDestroyed()) {
        win.close();
      }
    };
    const timer = setTimeout(finish, 2000);
    ipcMain.once("flush-before-close-done", finish);
    win.webContents.send("app-will-close");
  });

  // Dev: load Vite dev server; Prod: load built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ─── Register all IPC modules ───

function restartWatcher() {
  startWatcher(getNotesDir, getMainWindow);
}

registerNoteFileIPC(getMainWindow, getNotesDir, suppressWatcher);
registerOSTrashIPC(getNotesDir, suppressWatcher);
registerSettingsIPC(getMainWindow, restartWatcher);
registerSecureStorageIPC();
setupAutoUpdater(getMainWindow);

// ─── App lifecycle ───

app.whenReady().then(async () => {
  app.setName("Boojy Notes");
  nativeTheme.themeSource = "dark";

  const notesDir = getNotesDir();
  let legacyTrashReport;
  try {
    legacyTrashReport = await migrateLegacyTrash(notesDir);
  } catch (error) {
    // Migration is deliberately best-effort: an unforeseen filesystem error
    // must never block Boojy from opening or put legacy files at further risk.
    console.error("Legacy trash migration could not run", error);
    legacyTrashReport = {
      legacyTrashDir: path.join(notesDir, ".trash"),
      migrated: [],
      untouched: [
        {
          path: path.join(notesDir, ".trash"),
          reason: `Migration could not run safely: ${String(error)}`,
        },
      ],
    };
  }
  if (legacyTrashReport.migrated.length > 0) {
    console.info(
      `Moved ${legacyTrashReport.migrated.length} legacy deleted note(s) to the OS Trash`,
    );
  }

  // Custom protocol for resolving attachment paths to actual files
  protocol.handle("boojy-att", (request) => {
    const relativePath = decodeURIComponent(request.url.slice("boojy-att://".length));
    const notesDir = getNotesDir();
    const resolvedNotesDir = path.resolve(notesDir);

    // Try exact relative path first, then attachments/ folder
    let absPath = path.resolve(path.join(notesDir, relativePath));
    if (!fs.existsSync(absPath)) {
      const inAttachments = path.resolve(path.join(notesDir, "attachments", relativePath));
      if (inAttachments.startsWith(resolvedNotesDir + path.sep) && fs.existsSync(inAttachments)) {
        absPath = inAttachments;
      }
    }

    // Prevent path traversal: resolved path must stay inside notes directory
    if (!absPath.startsWith(resolvedNotesDir + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch("file://" + absPath.replace(/\\/g, "/"));
  });

  // Build custom menu (strips devTools from production builds)
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "Boojy Notes",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Import",
          submenu: [
            {
              label: "Markdown Files...",
              click: () => mainWindow?.webContents.send("menu:import", "markdown"),
            },
            {
              label: "HTML Files...",
              click: () => mainWindow?.webContents.send("menu:import", "html"),
            },
            {
              label: "Folder...",
              click: () => mainWindow?.webContents.send("menu:import", "folder"),
            },
          ],
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  if (legacyTrashReport.untouched.length > 0) {
    const examples = legacyTrashReport.untouched
      .slice(0, 8)
      .map((item) => `• ${path.basename(item.path)} — ${item.reason}`)
      .join("\n");
    const remaining = legacyTrashReport.untouched.length - 8;
    console.warn("Legacy trash items left untouched", legacyTrashReport.untouched);
    void dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Some deleted notes need attention",
      message: "Some previously deleted notes could not be moved to the system Trash.",
      detail: `${examples}${remaining > 0 ? `\n• …and ${remaining} more` : ""}\n\nNothing listed above was deleted. It remains in:\n${legacyTrashReport.legacyTrashDir}`,
    });
  }

  // Initialize spell check from saved settings
  const settings = loadSettings();
  const spellLangs = settings.spellCheckLanguages || ["en-US"];
  if (settings.spellCheckEnabled !== false) {
    mainWindow.webContents.session.setSpellCheckerLanguages(spellLangs);
  } else {
    mainWindow.webContents.session.setSpellCheckerLanguages([]);
  }

  // Context menu for spelling suggestions
  mainWindow.webContents.on("context-menu", (event, params) => {
    // Prevent native context menu — custom menus are handled in the renderer
    event.preventDefault();
    if (params.misspelledWord) {
      const menu = Menu.buildFromTemplate([
        ...params.dictionarySuggestions.map((s) => ({
          label: s,
          click: () => mainWindow.webContents.replaceMisspelling(s),
        })),
        { type: "separator" },
        {
          label: "Add to Dictionary",
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
      ]);
      menu.popup();
    }
  });

  restartWatcher();

  checkForUpdatesOnStartup();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  closeWatcher();
});
