import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module computes its file paths from `app.getPath` at import time, so the
// temp directories exist before the import below.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-userdata-"));
const documents = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-documents-"));

vi.mock("electron", () => ({
  app: { getPath: vi.fn((name) => (name === "userData" ? userData : documents)) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
}));
vi.mock("electron-updater", () => ({
  autoUpdater: { on: vi.fn(), checkForUpdates: vi.fn(async () => {}) },
}));

const { ipcMain } = await import("electron");
const {
  completeSetup,
  getNotesDir,
  loadConfig,
  loadSettings,
  registerSettingsIPC,
  saveConfig,
  saveSettings,
  settleSetupState,
} = await import("../../electron/settingsManager.js");

const SETTINGS = path.join(userData, "settings.json");
const CONFIG = path.join(userData, "config.json");

beforeEach(() => {
  for (const f of fs.readdirSync(userData)) fs.rmSync(path.join(userData, f), { recursive: true });
});

afterEach(() => {
  fs.rmSync(path.join(documents, "Boojy"), { recursive: true, force: true });
});

// A config torn by a crash mid-write parses as nothing, and the next launch
// opens the default vault: to the user, every note gone. Both files go
// through the same temp-file-and-rename write the notes do.
describe("config and settings persistence is atomic", () => {
  it("round-trips and leaves no temp file behind", () => {
    saveSettings({ theme: "night", autoUpdateEnabled: false });
    saveConfig({ notesDir: "/Volumes/Vault/Notes" });

    expect(loadSettings()).toEqual({ theme: "night", autoUpdateEnabled: false });
    expect(loadConfig()).toEqual({ notesDir: "/Volumes/Vault/Notes" });
    expect(fs.readdirSync(userData).sort()).toEqual(["config.json", "settings.json"]);
  });

  it("a write that fails part-way leaves the previous file intact", () => {
    saveConfig({ notesDir: "/Volumes/Vault/Notes" });
    // The temp file's name is taken by a directory, so opening it for the
    // write fails before a byte reaches the real file.
    fs.mkdirSync(path.join(userData, ".config.json.tmp"));

    expect(() => saveConfig({ notesDir: "/elsewhere" })).toThrow();

    expect(loadConfig()).toEqual({ notesDir: "/Volumes/Vault/Notes" });
    expect(JSON.parse(fs.readFileSync(CONFIG, "utf-8"))).toEqual({
      notesDir: "/Volumes/Vault/Notes",
    });
    expect(fs.existsSync(SETTINGS)).toBe(false);
  });
});

// A vault the user chose that is missing (an unmounted volume, a folder moved
// in Finder) must not come back as an empty directory on the boot disk with
// new notes quietly going into it. Only the default vault is the app's to make.
describe("getNotesDir", () => {
  it("names the default vault under Documents on a first launch, and makes it once setup is done", () => {
    const expected = path.join(documents, "Boojy", "Notes");
    expect(settleSetupState()).toBe(true);

    // First launch: named, not made, so a user who picks another folder in
    // setup is not left with an empty one in Documents.
    expect(getNotesDir()).toBe(expected);
    expect(fs.existsSync(expected)).toBe(false);

    expect(completeSetup()).toBe(expected);
    expect(fs.statSync(expected).isDirectory()).toBe(true);
    expect(loadConfig()).toEqual({ setupDone: true });
    // A later launch: made on demand as before, never asked again.
    fs.rmSync(expected, { recursive: true });
    expect(settleSetupState()).toBe(false);
    expect(getNotesDir()).toBe(expected);
    expect(fs.statSync(expected).isDirectory()).toBe(true);
  });

  it("treats a configured folder, or a default folder already on disk, as an existing user", () => {
    saveConfig({ notesDir: "/Volumes/Vault/Notes" });
    expect(settleSetupState()).toBe(false);
    expect(loadConfig()).toEqual({ notesDir: "/Volumes/Vault/Notes", setupDone: true });

    fs.rmSync(CONFIG);
    fs.mkdirSync(path.join(documents, "Boojy", "Notes"), { recursive: true });
    expect(settleSetupState()).toBe(false);
    expect(loadConfig()).toEqual({ setupDone: true });
  });

  it("chooses a folder in setup without a flag, and completeSetup then keeps that folder", () => {
    expect(settleSetupState()).toBe(true);
    saveConfig({ ...loadConfig(), notesDir: path.join(documents, "Chosen") });
    expect(completeSetup()).toBe(path.join(documents, "Chosen"));
    expect(fs.existsSync(path.join(documents, "Boojy"))).toBe(false);
    expect(loadConfig().setupDone).toBe(true);
  });

  it("never makes a configured vault that is missing", () => {
    const chosen = path.join(documents, "Unmounted", "Notes");
    saveConfig({ notesDir: chosen });

    expect(getNotesDir()).toBe(chosen);

    expect(fs.existsSync(chosen)).toBe(false);
    expect(fs.existsSync(path.join(documents, "Boojy"))).toBe(false);
  });
});

// The renderer asks once at mount whether the window is already in full
// screen (a reload, a window restored to it), before main.js's edge events
// can have told it; the inset that clears the traffic lights keys off the
// answer. No window means no full screen, never a throw.
describe("is-full-screen", () => {
  it("answers the window's own state, and false with no window", async () => {
    let win = null;
    registerSettingsIPC(() => win, vi.fn());
    const call = ipcMain.handle.mock.calls.find(([channel]) => channel === "is-full-screen");
    expect(call).toBeDefined();
    const handler = call[1];

    expect(await handler()).toBe(false);
    win = { isFullScreen: () => true };
    expect(await handler()).toBe(true);
    win = { isFullScreen: () => false };
    expect(await handler()).toBe(false);
  });
});
