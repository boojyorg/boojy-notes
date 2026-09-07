import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { writeFileAtomic } from "./atomicWrite.js";

const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");

// ─── Config (vault path) ───
// Both files are written atomically (temp file, fsync, rename): a config torn
// by a crash mid-write parses as nothing, and the next launch would open the
// default vault, which to the user reads as every note gone.

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  writeFileAtomic(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/**
 * The vault path. With no choice saved, the default vault under Documents is
 * the app's own to make, and it is made here the first time it is asked for.
 * A vault the user chose is never made: if it is missing (an unmounted
 * volume, a folder moved in Finder) the app opens it empty and every write
 * refuses, rather than quietly building an empty twin on the boot disk.
 */
function getNotesDir() {
  const cfg = loadConfig();
  if (cfg.notesDir) return cfg.notesDir;
  const fallback = path.join(app.getPath("documents"), "Boojy", "Notes");
  if (!fs.existsSync(fallback)) {
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch {
      /* reported by the first write, which refuses on a missing vault */
    }
  }
  return fallback;
}

// ─── Settings ───

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  writeFileAtomic(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ─── Auto-updater setup ───

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let updateStatus = { state: "idle" };

function sendUpdateStatus(status, getMainWindow) {
  updateStatus = status;
  if (getMainWindow()) getMainWindow().webContents.send("update-status", status);
}

function setupAutoUpdater(getMainWindow) {
  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus({ state: "checking" }, getMainWindow);
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({ state: "available", version: info.version }, getMainWindow);
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus({ state: "up-to-date" }, getMainWindow);
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus(
      { state: "downloading", percent: Math.round(progress.percent) },
      getMainWindow,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus({ state: "downloaded", version: info.version }, getMainWindow);
  });

  autoUpdater.on("error", (err) => {
    sendUpdateStatus({ state: "error", message: err?.message || "Update error" }, getMainWindow);
  });
}

// ─── Register IPC handlers ───

function registerSettingsIPC(getMainWindow, restartWatcher) {
  ipcMain.handle("choose-notes-dir", async () => {
    const { dialog } = await import("electron");
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Notes Folder",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = result.filePaths[0];
    saveConfig({ ...loadConfig(), notesDir: dir });
    restartWatcher();
    return dir;
  });

  ipcMain.handle("get-settings", () => loadSettings());

  ipcMain.handle("set-setting", (_event, key, value) => {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
    return settings;
  });

  ipcMain.on("set-window-title", (_, title) => {
    const win = getMainWindow();
    if (win) win.setTitle(title);
  });

  ipcMain.handle("toggle-spellcheck", (_event, { enabled, languages }) => {
    const settings = loadSettings();
    settings.spellCheckEnabled = enabled;
    if (languages) settings.spellCheckLanguages = languages;
    saveSettings(settings);
    const win = getMainWindow();
    if (win) {
      const langs = enabled ? languages || settings.spellCheckLanguages || ["en-US"] : [];
      win.webContents.session.setSpellCheckerLanguages(langs);
    }
    return settings;
  });

  // ─── Auto-updater IPC ───

  ipcMain.handle("check-for-update", () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.handle("get-update-status", () => updateStatus);

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("set-auto-update", (_event, enabled) => {
    const settings = loadSettings();
    settings.autoUpdateEnabled = enabled;
    saveSettings(settings);
    return settings;
  });

  ipcMain.handle("get-auto-update", () => {
    const settings = loadSettings();
    return settings.autoUpdateEnabled !== false;
  });
}

/**
 * Check for updates on startup if enabled.
 */
function checkForUpdatesOnStartup() {
  if (!process.env.VITE_DEV_SERVER_URL) {
    const s = loadSettings();
    if (s.autoUpdateEnabled !== false) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }
}

export {
  loadConfig,
  saveConfig,
  getNotesDir,
  loadSettings,
  saveSettings,
  setupAutoUpdater,
  registerSettingsIPC,
  checkForUpdatesOnStartup,
};
