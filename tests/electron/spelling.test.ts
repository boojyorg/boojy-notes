import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, ipcMain: { handle: vi.fn() }, shell: {} }));
vi.mock("../../electron/settingsManager.js", () => ({
  loadSettings: () => ({}),
  saveSettings: vi.fn(),
}));

const { macMisspellings, onDictionaryReady } = await import("../../electron/spelling");

describe("onDictionaryReady", () => {
  it("tells the window each time a dictionary is ready, until unsubscribed", () => {
    const session = new EventEmitter();
    const notify = vi.fn();
    const stop = onDictionaryReady(session as never, notify);
    session.emit("spellcheck-dictionary-initialized", "en-GB");
    session.emit("spellcheck-dictionary-initialized", "es");
    expect(notify).toHaveBeenCalledTimes(2);
    stop();
    session.emit("spellcheck-dictionary-initialized", "fr");
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

// The system's own checker and language recognizer: a Mac only.
describe.skipIf(process.platform !== "darwin")("macMisspellings", () => {
  it("reads a one-word item in one of the user's languages, never another", async () => {
    // Asked of every language, `Conference` read as French (underlined) and
    // `Conferance` as Norwegian (passed).
    const words = await macMisspellings(
      ["Conference", "Conferance", "Manzanas"],
      ["es-GB", "en-GB"],
    );
    expect(words).toEqual([[], ["Conferance"], []]);
  });
});
