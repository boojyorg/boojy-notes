/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the capacitorAPI export from nativeAPI.js
// The setup.js already mocks @capacitor/* modules

describe("nativeAPI (capacitorAPI)", () => {
  let capacitorAPI;

  beforeEach(async () => {
    vi.resetModules();
    // Dynamic import to get a fresh module each time
    const mod = await import("../../src/services/nativeAPI.js");
    capacitorAPI = mod.default;
  });

  it("exports a default object with expected core methods", () => {
    expect(capacitorAPI).toBeDefined();
    expect(typeof capacitorAPI.readAllNotes).toBe("function");
    expect(typeof capacitorAPI.writeNote).toBe("function");
    expect(typeof capacitorAPI.deleteNoteFile).toBe("function");
  });

  it("has trash methods", () => {
    expect(typeof capacitorAPI.trashNote).toBe("function");
    expect(typeof capacitorAPI.readTrash).toBe("function");
    expect(typeof capacitorAPI.restoreNote).toBe("function");
    expect(typeof capacitorAPI.purgeTrash).toBe("function");
    expect(typeof capacitorAPI.emptyTrash).toBe("function");
  });

  it("has attachment methods", () => {
    expect(typeof capacitorAPI.saveImage).toBe("function");
    expect(typeof capacitorAPI.saveAttachment).toBe("function");
    expect(typeof capacitorAPI.pickImageFile).toBe("function");
    expect(typeof capacitorAPI.pickFile).toBe("function");
    expect(typeof capacitorAPI.resolveAttachment).toBe("function");
    expect(typeof capacitorAPI.getFileSize).toBe("function");
  });

  it("has settings methods", () => {
    expect(typeof capacitorAPI.getSettings).toBe("function");
    expect(typeof capacitorAPI.setSetting).toBe("function");
  });

  it("has navigation methods", () => {
    expect(typeof capacitorAPI.openExternal).toBe("function");
  });

  it("getNotesDir returns expected path", () => {
    expect(capacitorAPI.getNotesDir()).toBe("Documents/BoojyNotes");
  });

  it("has no-op terminal stubs", () => {
    expect(capacitorAPI.terminal).toBeDefined();
    expect(typeof capacitorAPI.terminal.create).toBe("function");
    expect(typeof capacitorAPI.terminal.write).toBe("function");
    expect(typeof capacitorAPI.terminal.resize).toBe("function");
    expect(typeof capacitorAPI.terminal.kill).toBe("function");
    expect(typeof capacitorAPI.terminal.killAll).toBe("function");
    expect(typeof capacitorAPI.terminal.onData).toBe("function");
    expect(typeof capacitorAPI.terminal.onExit).toBe("function");
  });

  it("terminal.onData returns an unsubscribe function", () => {
    const unsub = capacitorAPI.terminal.onData();
    expect(typeof unsub).toBe("function");
    // Calling unsub should not throw
    expect(() => unsub()).not.toThrow();
  });

  it("has secureStorage methods", () => {
    expect(capacitorAPI.secureStorage).toBeDefined();
    expect(typeof capacitorAPI.secureStorage.store).toBe("function");
    expect(typeof capacitorAPI.secureStorage.read).toBe("function");
    expect(typeof capacitorAPI.secureStorage.delete).toBe("function");
  });

  it("secureStorage.read returns empty string when no key stored", async () => {
    const val = await capacitorAPI.secureStorage.read("test-key");
    expect(val).toBe("");
  });

  it("getSettings returns empty object when nothing stored", async () => {
    const settings = await capacitorAPI.getSettings();
    expect(settings).toEqual({});
  });

  it("getUpdateStatus returns idle state", async () => {
    const status = await capacitorAPI.getUpdateStatus();
    expect(status).toEqual({ state: "idle" });
  });

  it("getAutoUpdate returns false", async () => {
    const result = await capacitorAPI.getAutoUpdate();
    expect(result).toBe(false);
  });

  it("no-op functions do not throw", async () => {
    await expect(capacitorAPI.exportPdf()).resolves.toBeUndefined();
    await expect(capacitorAPI.exportDocx()).resolves.toBeUndefined();
    await expect(capacitorAPI.importMarkdown()).resolves.toBeUndefined();
    await expect(capacitorAPI.checkForUpdate()).resolves.toBeUndefined();
    expect(() => capacitorAPI.setWindowTitle("test")).not.toThrow();
  });

  it("onMenuExport returns an unsubscribe function", () => {
    const unsub = capacitorAPI.onMenuExport();
    expect(typeof unsub).toBe("function");
  });

  it("onFileChanged returns an unsubscribe function", () => {
    const unsub = capacitorAPI.onFileChanged();
    expect(typeof unsub).toBe("function");
  });
});
