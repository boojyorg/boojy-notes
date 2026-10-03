import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, ipcMain: { handle: vi.fn() }, shell: {} }));
vi.mock("../../electron/settingsManager.js", () => ({
  loadSettings: () => ({}),
  saveSettings: vi.fn(),
}));

const { onDictionaryReady } = await import("../../electron/spelling");

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
