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

const { getNotesDir, loadConfig, loadSettings, saveConfig, saveSettings } = await import(
  "../../electron/settingsManager.js"
);

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
  it("makes the default vault under Documents when nothing is configured", () => {
    const dir = getNotesDir();

    expect(dir).toBe(path.join(documents, "Boojy", "Notes"));
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("never makes a configured vault that is missing", () => {
    const chosen = path.join(documents, "Unmounted", "Notes");
    saveConfig({ notesDir: chosen });

    expect(getNotesDir()).toBe(chosen);

    expect(fs.existsSync(chosen)).toBe(false);
    expect(fs.existsSync(path.join(documents, "Boojy"))).toBe(false);
  });
});
