import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, ipcMain: { handle: vi.fn() }, shell: {} }));
vi.mock("../../electron/settingsManager.js", () => ({
  loadSettings: () => ({}),
  saveSettings: vi.fn(),
}));

const { macGuesses, macMisspellings, onDictionaryReady } = await import("../../electron/spelling");

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
describe.skipIf(process.platform !== "darwin")(
  "a Mac's spelling, in every language the user has",
  () => {
    const LANGS = ["es-GB", "en-GB"];

    it("underlines a word only when every language rejects it", async () => {
      // One-word items were read as French or Norwegian; a mixed paragraph as
      // English alone, underlining its Spanish.
      const words = await macMisspellings(
        [
          "Conference",
          "Conferance",
          "Manzanas",
          "Press </> to see the raw Markdown. Por ejemplo en español es gris.",
          "I bought it at the mercado yesterdy.",
        ],
        LANGS,
      );
      expect(words).toEqual([[], ["Conferance"], [], [], ["yesterdy"]]);
    });

    it("answers a right-click: nothing for a word some language accepts, else guesses", async () => {
      expect(await macGuesses("ejemplo", "Por ejemplo en español.", LANGS)).toBeNull();
      const guesses = await macGuesses("yesterdy", "I bought it yesterdy.", LANGS);
      expect(guesses?.[0]).toBe("yesterday");
    });

    it("offers the sentence's language first", async () => {
      const inSpanish = await macGuesses("manzanna", "Compré una manzanna ayer.", LANGS);
      const inEnglish = await macGuesses("manzanna", "I ate a manzanna today.", LANGS);
      expect(inSpanish?.[0]).toBe("manzana");
      expect(inEnglish?.[0]).not.toBe("manzana");
    });
  },
);
