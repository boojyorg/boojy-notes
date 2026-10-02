import { execFile } from "node:child_process";
import { app, ipcMain, type Session, shell } from "electron";
import { loadSettings, saveSettings } from "./settingsManager.js";

/**
 * Spelling: the system's own checker, which draws the red underline, and the
 * Spelling section in Settings.
 *
 * - **On a Mac the system chooses the language** (Keyboard → Text Input), so
 *   the app stores no languages there. Chromium asks it about one word at a
 *   time, with no sentence to tell the language by, and the system answers in
 *   its first language: an English word on a Spanish Mac got Spanish guesses
 *   or none. So the right-click menu asks the system directly, in the
 *   language of the word's paragraph (`MAC_CHECK`).
 * - **Elsewhere the app chooses**: any number of languages, checked together.
 * - Both apply at once to the open window, with no restart.
 */

const isMac = process.platform === "darwin";
const MAX_SUGGESTIONS = 3;
const KEYBOARD_SETTINGS_URL = "x-apple.systempreferences:com.apple.Keyboard-Settings.extension";

/**
 * Run by `osascript -l JavaScript`: answers `null` for a word the system
 * spells, else its first guesses. The language is the paragraph's, in the
 * spelling the system's language list gives it (the list's `en-GB`, never a
 * plain `en`, which is US English); with none told, the system's own.
 */
const MAC_CHECK = `
ObjC.import("AppKit");
function run(argv) {
  const word = argv[0], paragraph = argv[1], preferred = JSON.parse(argv[2]);
  const checker = $.NSSpellChecker.sharedSpellChecker;
  const available = ObjC.deepUnwrap(checker.availableLanguages);
  const told = ObjC.unwrap($.NSLinguisticTagger.dominantLanguageForString(paragraph)) || "";
  const candidates = told
    ? preferred.map((l) => l.replace("-", "_")).filter((l) => l.startsWith(told + "_")).concat(told)
    : [];
  const lang = candidates.find((l) => available.includes(l)) || ObjC.unwrap(checker.language);
  const miss = checker.checkSpellingOfStringStartingAtLanguageWrapInSpellDocumentWithTagWordCount(
    word, 0, $(lang), false, 0, null);
  // A range's fields arrive as strings ("0").
  if (Number(miss.length) === 0) return "null";
  const guesses = ObjC.deepUnwrap(checker.guessesForWordRangeInStringLanguageInSpellDocumentWithTag(
    $.NSMakeRange(0, word.length), word, $(lang), 0)) || [];
  return JSON.stringify(guesses.slice(0, ${MAX_SUGGESTIONS}));
}`;

function macCheck(word: string, paragraph: string): Promise<string[] | null> {
  const preferred = JSON.stringify(app.getPreferredSystemLanguages());
  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", MAC_CHECK, word, paragraph, preferred],
      { timeout: 2000 },
      (err, stdout) => {
        try {
          resolve(err ? null : JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

const spellingOn = () => loadSettings().spellCheckEnabled !== false;

/** The stored choice, applied to a window's session: at its creation and on every change. */
export function applySpelling(session: Session) {
  const settings = loadSettings();
  session.setSpellCheckerEnabled(settings.spellCheckEnabled !== false);
  const chosen: string[] = settings.spellCheckLanguages ?? [];
  const usable = chosen.filter((l) => session.availableSpellCheckerLanguages.includes(l));
  if (!isMac && usable.length) session.setSpellCheckerLanguages(usable);
}

export interface SpellingState {
  enabled: boolean;
  /** The languages checked; on a Mac, empty (the system's). */
  languages: string[];
  available: string[];
  /** On a Mac the system chooses the language, never the app. */
  setBySystem: boolean;
}

function spellingState(session: Session): SpellingState {
  return {
    enabled: spellingOn(),
    languages: isMac ? [] : session.getSpellCheckerLanguages(),
    available: isMac ? [] : session.availableSpellCheckerLanguages,
    setBySystem: isMac,
  };
}

export function registerSpellingIPC() {
  // A Mac's answer, in the paragraph's language; elsewhere the preload asks
  // the window's own checker, which already holds the chosen languages.
  ipcMain.handle("check-spelling", (_event, word: string, paragraph: string) =>
    isMac && spellingOn() ? macCheck(word, paragraph) : null,
  );
  ipcMain.handle("get-spelling", (event) => spellingState(event.sender.session));
  ipcMain.handle("set-spelling", (event, change: { enabled?: boolean; languages?: string[] }) => {
    const settings = loadSettings();
    if (typeof change.enabled === "boolean") settings.spellCheckEnabled = change.enabled;
    if (!isMac && Array.isArray(change.languages) && change.languages.length) {
      settings.spellCheckLanguages = change.languages;
    }
    saveSettings(settings);
    applySpelling(event.sender.session);
    return spellingState(event.sender.session);
  });
  // On a Mac (and Windows 10 on) the word joins the system's own list, so
  // every app learns it; Undo takes it out again.
  ipcMain.handle("add-dictionary-word", (event, word: string) =>
    event.sender.session.addWordToSpellCheckerDictionary(word),
  );
  ipcMain.handle("remove-dictionary-word", (event, word: string) =>
    event.sender.session.removeWordFromSpellCheckerDictionary(word),
  );
  ipcMain.handle("open-keyboard-settings", () => {
    if (isMac) void shell.openExternal(KEYBOARD_SETTINGS_URL);
  });
}
