import { execFile } from "node:child_process";
import { app, ipcMain, type Session, shell, type WebContents } from "electron";
import { loadSettings, saveSettings } from "./settingsManager.js";

/**
 * Spelling: the system's own checker, which draws the red underline, and the
 * Spelling section in Settings.
 *
 * - **On a Mac the system chooses the language** (Keyboard → Text Input), so
 *   the app stores no languages there. Chromium asks it about one word at a
 *   time, with no sentence to tell the language by, and the system answers in
 *   its first language: an English word on a Spanish Mac got Spanish guesses
 *   or none. So the app asks the system directly, for the underline and the
 *   right-click menu alike, in each paragraph's language (`MAC_PARAGRAPHS`,
 *   `MAC_WORD`).
 * - **Elsewhere the app chooses**: any number of languages, checked together.
 * - **On Windows the underline and the guesses are Chromium's.** It hands
 *   every language Windows has installed to Windows' own checker, which
 *   answers no word-by-word question (`webFrame.isWordMisspelled` reads only
 *   Hunspell, so every word read as spelled right and nothing was ever
 *   underlined). The window draws Chromium's own line there, and a
 *   right-click's word and guesses are what Chromium sends with the menu
 *   event (`watchMenuSpelling`).
 * - Both apply at once to the open window, with no restart.
 */

const isMac = process.platform === "darwin";
const MAX_SUGGESTIONS = 3;
const KEYBOARD_SETTINGS_URL = "x-apple.systempreferences:com.apple.Keyboard-Settings.extension";

/**
 * Run by `osascript -l JavaScript`, before either script below: a text's
 * language is the paragraph's, in the spelling the system's language list
 * gives it (the list's `en-GB`, never a plain `en`, which is US English);
 * with none told, the system's own. A range's fields arrive as strings ("0").
 */
const MAC_PRELUDE = `
ObjC.import("AppKit");
const checker = $.NSSpellChecker.sharedSpellChecker;
const available = ObjC.deepUnwrap(checker.availableLanguages);
function langFor(text, preferred) {
  const told = ObjC.unwrap($.NSLinguisticTagger.dominantLanguageForString(text)) || "";
  const candidates = told
    ? preferred.map((l) => l.replace("-", "_")).filter((l) => l.startsWith(told + "_")).concat(told)
    : [];
  return $(candidates.find((l) => available.includes(l)) || ObjC.unwrap(checker.language));
}
function missAt(text, at, lang) {
  const r = checker.checkSpellingOfStringStartingAtLanguageWrapInSpellDocumentWithTagWordCount(
    text, at, lang, false, 0, null);
  return Number(r.length) ? [Number(r.location), Number(r.length)] : null;
}`;

/** One word in its paragraph: `null` when spelled right, else its first guesses. */
const MAC_WORD = `${MAC_PRELUDE}
function run(argv) {
  const word = argv[0], lang = langFor(argv[1], JSON.parse(argv[2]));
  if (!missAt(word, 0, lang)) return "null";
  const guesses = ObjC.deepUnwrap(checker.guessesForWordRangeInStringLanguageInSpellDocumentWithTag(
    $.NSMakeRange(0, word.length), word, lang, 0)) || [];
  return JSON.stringify(guesses.slice(0, ${MAX_SUGGESTIONS}));
}`;

/** Paragraphs (a JSON array on stdin): each one's misspelled words. */
const MAC_PARAGRAPHS = `${MAC_PRELUDE}
function run(argv) {
  const input = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const texts = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input, $.NSUTF8StringEncoding)));
  const preferred = JSON.parse(argv[0]);
  return JSON.stringify(texts.map((text) => {
    const lang = langFor(text, preferred), words = [];
    for (let at = 0, miss; (miss = missAt(text, at, lang)); at = miss[0] + miss[1]) {
      words.push(text.substr(miss[0], miss[1]));
    }
    return words;
  }));
}`;

/** Runs a script, answering its parsed output, or `fallback` on any failure. */
function osa<T>(script: string, args: string[], fallback: T, stdin?: string): Promise<T> {
  return new Promise((resolve) => {
    const child = execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script, ...args],
      { timeout: 5000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        try {
          resolve(err ? fallback : JSON.parse(stdout));
        } catch {
          resolve(fallback);
        }
      },
    );
    child.stdin?.end(stdin ?? "");
  });
}

const preferred = () => JSON.stringify(app.getPreferredSystemLanguages());

const spellingOn = () => loadSettings().spellCheckEnabled !== false;

/**
 * Off a Mac, Chromium loads (on a first launch, downloads) a language's
 * dictionary after the window is up; a note checked before then got no
 * misspellings back and kept none until an edit. `notify` runs each time a
 * dictionary is ready, so the window asks again. Returns the unsubscribe.
 */
export function onDictionaryReady(session: Session, notify: () => void): () => void {
  session.on("spellcheck-dictionary-initialized", notify);
  return () => session.off("spellcheck-dictionary-initialized", notify);
}

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

/** The latest right-click's spelling, as Chromium reported it with the menu event (Windows). */
let menuSpelling: { at: number; word: string; suggestions: string[] } | null = null;
let menuWaiters: Array<() => void> = [];

/**
 * Windows: keep what each right-click in the window reports about the word
 * under the pointer (`misspelledWord`, empty when it is spelled right, and
 * Windows' guesses) for the renderer's menu to ask for (`menu-spelling`).
 * Returns the unsubscribe.
 */
export function watchMenuSpelling(contents: WebContents): () => void {
  const onMenu = (_event: unknown, params: Electron.ContextMenuParams) => {
    menuSpelling = {
      at: Date.now(),
      word: params.misspelledWord,
      suggestions: params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS),
    };
    for (const wake of menuWaiters) wake();
    menuWaiters = [];
  };
  contents.on("context-menu", onMenu);
  return () => contents.off("context-menu", onMenu);
}

/** The menu event's spelling for the right-click being answered: one just in, or the next. */
function nextMenuSpelling(): Promise<typeof menuSpelling> {
  // The renderer asks while its own `contextmenu` handler runs; Chromium's
  // menu event follows it by a few milliseconds, or has just arrived.
  if (menuSpelling && Date.now() - menuSpelling.at < 100) return Promise.resolve(menuSpelling);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 500);
    menuWaiters.push(() => {
      clearTimeout(timer);
      resolve(menuSpelling);
    });
  });
}

export function registerSpellingIPC() {
  ipcMain.handle("menu-spelling", () => nextMenuSpelling());
  // A Mac's answer, in the paragraph's language; elsewhere the preload asks
  // the window's own checker, which already holds the chosen languages.
  ipcMain.handle("check-spelling", (_event, word: string, paragraph: string) =>
    isMac && spellingOn() ? osa(MAC_WORD, [word, paragraph, preferred()], null) : null,
  );
  // The whole note at once, for the underline: one script for every paragraph.
  ipcMain.handle("check-paragraphs", (_event, texts: string[]) =>
    isMac && spellingOn()
      ? osa(
          MAC_PARAGRAPHS,
          [preferred()],
          texts.map(() => []),
          JSON.stringify(texts),
        )
      : texts.map(() => []),
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
  ipcMain.handle("learned-words", (event) =>
    event.sender.session.listWordsInSpellCheckerDictionary(),
  );
  ipcMain.handle("open-keyboard-settings", () => {
    if (isMac) void shell.openExternal(KEYBOARD_SETTINGS_URL);
  });
}
