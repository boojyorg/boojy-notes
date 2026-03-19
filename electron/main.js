import { app, BrowserWindow, ipcMain, Menu, protocol, net, nativeTheme } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerTerminalIPC, killAllTerminals } from "./terminal.js";
import { registerNoteFileIPC } from "./noteFileManager.js";
import { registerTrashIPC } from "./trashManager.js";
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
registerTrashIPC(getNotesDir);
registerSettingsIPC(getMainWindow, restartWatcher);
registerSecureStorageIPC();
setupAutoUpdater(getMainWindow);

// ─── App lifecycle ───

app.whenReady().then(() => {
  app.setName("Boojy Notes");
  nativeTheme.themeSource = "dark";

  // Custom protocol for resolving attachment paths to actual files
  protocol.handle("boojy-att", (request) => {
    const relativePath = decodeURIComponent(request.url.slice("boojy-att://".length));
    const notesDir = getNotesDir();
    // Try exact relative path first, then attachments/ folder, then legacy .attachments/
    let absPath = path.join(notesDir, relativePath);
    if (!fs.existsSync(absPath)) {
      const inAttachments = path.join(notesDir, "attachments", relativePath);
      if (fs.existsSync(inAttachments)) {
        absPath = inAttachments;
      }
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
          label: "Export",
          submenu: [
            {
              label: "PDF...",
              click: () => mainWindow?.webContents.send("menu:export", "pdf"),
            },
            {
              label: "DOCX...",
              click: () => mainWindow?.webContents.send("menu:export", "docx"),
            },
          ],
        },
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
  registerTerminalIPC(ipcMain, () => mainWindow, getNotesDir);

  checkForUpdatesOnStartup();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killAllTerminals();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killAllTerminals();
  closeWatcher();
});
