import { app, BrowserWindow, Menu, protocol, net, nativeTheme, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerNoteFileIPC } from "./noteFileManager.js";
import { migrateLegacyTrash, registerOSTrashIPC } from "./osTrash.js";
import { registerFolderIPC } from "./folders.js";
import {
  startWatcher,
  suppressWatcher,
  suppressWatcherTree,
  suppressNextUnlink,
  releaseUnlinkSuppression,
  closeWatcher,
} from "./fileWatcher.js";
import {
  getNotesDir,
  loadSettings,
  saveSettings,
  setupAutoUpdater,
  registerSettingsIPC,
  checkForUpdatesOnStartup,
} from "./settingsManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Window ───

let mainWindow = null;
let isQuitting = false;

function getMainWindow() {
  return mainWindow;
}

// Test-only. The real-Electron suite (`pnpm test:electron`) runs the app with
// its window hidden so routine runs don't take over the desktop; Playwright
// drives the renderer over CDP, which needs no OS focus. Timers must keep
// running at full speed while hidden, or the text-commit and write debounces
// the suite exists to exercise would stall behind Chromium's background
// throttling. Never set outside the test harness.
const hiddenForTests = process.env.BOOJY_TEST_HIDDEN === "1";

function createWindow() {
  mainWindow = new BrowserWindow({
    show: !hiddenForTests,
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: "Boojy Notes",
    titleBarStyle: "hiddenInset",
    // The lights share the sidebar header row. Its children centre at ~25px,
    // but the wordmark's optical mass sits below its geometric centre, so the
    // lights ride a few px lower than pure maths says (judged live
    // 2026-08-23). x pairs with MAC_TRAFFIC_INSET in EditorChrome.jsx — move
    // one, re-judge the other.
    trafficLightPosition: { x: 14, y: 26 },
    // First-paint ground before React takes over. DAY's BG.darkest — light is
    // the default theme; a NIGHT user gets one brief light flash at launch
    // until the renderer can report its saved theme back (not wired up).
    backgroundColor: "#FCFCFC",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: !hiddenForTests,
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
registerOSTrashIPC(getNotesDir, {
  suppressUnlink: suppressNextUnlink,
  releaseUnlink: releaseUnlinkSuppression,
});
registerFolderIPC(getNotesDir, { suppressTree: suppressWatcherTree });
registerSettingsIPC(getMainWindow, restartWatcher);
setupAutoUpdater(getMainWindow);

// ─── App lifecycle ───

app.whenReady().then(async () => {
  app.setName("Boojy Notes");
  // No Dock icon either while hidden for tests, or launching would still pull
  // focus to the app on macOS.
  if (hiddenForTests) app.dock?.hide();
  // Native chrome (menus, dialogs) follows the OS. Forcing "dark" here made
  // native surfaces dark even for the (default) light app theme.
  nativeTheme.themeSource = "system";

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
    console.warn("Legacy trash items left untouched", legacyTrashReport.untouched);
    // The untouched set is recomputed on every launch (the files deliberately
    // stay in place), so warn once per distinct problem set, not per launch.
    const warnedSignature = JSON.stringify(
      legacyTrashReport.untouched.map((item) => `${item.path} — ${item.reason}`).sort(),
    );
    const settings = loadSettings();
    if (settings.legacyTrashWarnedSignature !== warnedSignature) {
      const examples = legacyTrashReport.untouched
        .slice(0, 8)
        .map((item) => `• ${path.basename(item.path)} — ${item.reason}`)
        .join("\n");
      const remaining = legacyTrashReport.untouched.length - 8;
      void dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Some deleted notes need attention",
        message: "Some previously deleted notes could not be moved to the system Trash.",
        detail: `${examples}${remaining > 0 ? `\n• …and ${remaining} more` : ""}\n\nNothing listed above was deleted. It remains in:\n${legacyTrashReport.legacyTrashDir}`,
      });
      try {
        saveSettings({ ...settings, legacyTrashWarnedSignature: warnedSignature });
      } catch (error) {
        // Failing to persist the acknowledgement re-shows the warning next
        // launch — annoying, but it must never block startup.
        console.error("Could not persist the legacy-trash warning signature", error);
      }
    }
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
