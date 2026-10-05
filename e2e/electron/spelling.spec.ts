/**
 * Spelling: the app's own underline (drawn as the note opens, focused or not;
 * never in code, a tag or a link) and the right-click menu on an underlined
 * word: its guesses and Add to dictionary above Cut, Copy and Paste. A guess
 * is typed over the word (one undoable edit, saved as typing is); Add to
 * dictionary teaches the system, and its toast's Undo takes the word back
 * out. On a Mac both come in the word's paragraph's language.
 *
 * Add to dictionary writes to the system's own word list on a Mac, so the
 * word added is made up and is always removed again, pass or fail.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, MOD, launchApp, waitForFile, isMac } from "./harness";

const MADE_UP = "Zorblaxify";

/** Right-click the middle of `word` in the paragraph holding it. */
async function rightClick(page: Page, word: string) {
  const at = await page.evaluate((w) => {
    const walker = document.createTreeWalker(
      document.querySelector("[data-editor]")!,
      NodeFilter.SHOW_TEXT,
    );
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const i = t.textContent!.indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(t, i + 1);
      r.setEnd(t, i + 2);
      const b = r.getBoundingClientRect();
      return { x: b.left + 1, y: b.top + b.height / 2 };
    }
    throw new Error(`no ${w}`);
  }, word);
  await page.mouse.click(at.x, at.y, { button: "right" });
}

/** The words the underline is drawn under, as the browser holds them. */
const underlined = (page: Page) =>
  page.evaluate(() => {
    const h = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get(
      "spelling",
    );
    return h ? [...h].map((r) => r.toString()).sort() : [];
  });

const rows = (page: Page) => page.locator(".editor-context-menu [role=menuitem]").allInnerTexts();
const closeMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.locator(".editor-context-menu")).toHaveCount(0);
};

/** The checker is ready: a Linux machine downloads its dictionary first. */
const checkerReady = (page: Page) =>
  expect
    .poll(
      () => page.evaluate(() => window.electronAPI!.checkSpelling("recieve", "I recieve it.")),
      {
        timeout: 20_000,
      },
    )
    .not.toBeNull();

// Windows' own checker answers no word-by-word check, and Chromium hands it
// every language Windows has installed: underlines and guesses never appear
// there (docs/BACKLOG.md, Known issues).
test.fixme(process.platform === "win32", "spelling does not work on Windows yet");

let h: AppHandle;
test.beforeEach(async () => {
  h = await launchApp({
    "Alpha.md": `I recieve the parcel.\n\nThe ${MADE_UP} is here.\n\nVoy a recivir el paquete mañana.\n\nSee \`codee\` and #tagg here.\n`,
  });
  await h.openNote("Alpha");
  await checkerReady(h.page);
  await expect.poll(() => underlined(h.page)).toContain("recieve");
});
test.afterEach(async () => {
  await h.app.evaluate(({ session }, w) => {
    session.defaultSession.removeWordFromSpellCheckerDictionary(w);
  }, MADE_UP);
  await h.close();
});

test("a note's misspelled words are underlined as it opens, before any click; never code or a tag", async () => {
  expect(await h.page.evaluate(() => !!document.activeElement?.closest("[data-editor]"))).toBe(
    false,
  );
  const words = await underlined(h.page);
  expect(words).toEqual(expect.arrayContaining(["recieve", MADE_UP]));
  expect(words).not.toContain("codee");
  expect(words).not.toContain("tagg");
});

test("a typed word is underlined once the caret leaves it, and an undo keeps the lines", async () => {
  await h.page.locator("[data-editor] [data-block-id]").first().click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.type(" wordd", { delay: 20 });
  await h.page.waitForTimeout(600);
  expect(await underlined(h.page)).not.toContain("wordd");
  await h.page.keyboard.type(" ");
  await expect.poll(() => underlined(h.page)).toContain("wordd");
  // An undo repaints the paragraph: its lines are drawn again at once, never
  // left on the old nodes (an empty range) waiting for the next answer.
  const before = await h.page.locator("[data-editor]").innerText();
  await h.page.keyboard.press(`${MOD}+z`);
  await expect.poll(() => h.page.locator("[data-editor]").innerText()).not.toBe(before);
  const after = await underlined(h.page);
  expect(after).toEqual(expect.arrayContaining(["recieve", "wordd"]));
  expect(after).not.toContain("");
});

test("a misspelled word's guesses sit above Cut, Copy and Paste; a guess is one undoable edit", async () => {
  await rightClick(h.page, "recieve");
  await expect.poll(() => rows(h.page)).toContain("Add to dictionary");
  const labels = await rows(h.page);
  expect(labels[0]).toBe("receive");
  expect(labels.length).toBeLessThanOrEqual(3 + 1 + 3);
  expect(labels.indexOf("Add to dictionary")).toBeLessThan(
    labels.findIndex((l) => l.startsWith("Cut")),
  );
  await h.page.locator(".editor-context-menu [role=menuitem]", { hasText: /^receive$/ }).click();
  await waitForFile(h.vault.file("Alpha.md"), (t) => t.startsWith("I receive the parcel."));
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("Alpha.md"), (t) => t.startsWith("I recieve the parcel."));
});

test("a word spelled right, a link or a tag gets Cut, Copy and Paste alone", async () => {
  await rightClick(h.page, "parcel");
  await expect(h.page.locator(".editor-context-menu")).toBeVisible();
  expect((await rows(h.page))[0]).toMatch(/^Cut/);
  await closeMenu(h.page);
});

/** A fresh right-click's rows: Linux hands a learned word to the page's checker a moment later. */
const offered = async () => {
  await rightClick(h.page, MADE_UP);
  await expect(h.page.locator(".editor-context-menu")).toBeVisible();
  const labels = await rows(h.page);
  await closeMenu(h.page);
  return labels.includes("Add to dictionary");
};
const addMadeUp = async () => {
  await rightClick(h.page, MADE_UP);
  await h.page.getByRole("menuitem", { name: "Add to dictionary" }).click();
  await expect(h.page.getByText(`Added "${MADE_UP}" to dictionary`)).toBeVisible();
};

test("Add to dictionary teaches the word: its line goes", async () => {
  await addMadeUp();
  await expect.poll(() => underlined(h.page)).not.toContain(MADE_UP);
  await expect.poll(offered).toBe(false);
});

// Off a Mac a language's dictionary can finish loading after the note was
// checked (a first launch downloads it); the note is checked again then. The
// word is learned behind the app's back, so only that event can clear it.
test("a dictionary that becomes ready after the note was checked brings the lines up to date", async () => {
  // A Mac's checker loads no dictionary, and its word list is the system's,
  // where a word added and removed at once can outlive the test.
  test.skip(isMac, "a Mac's checker never loads a dictionary");
  expect(await underlined(h.page)).toContain(MADE_UP);
  await h.app.evaluate(({ session }, w) => {
    session.defaultSession.addWordToSpellCheckerDictionary(w);
  }, MADE_UP);
  await h.page.waitForTimeout(400);
  expect(await underlined(h.page)).toContain(MADE_UP);
  await h.app.evaluate(({ session }) => {
    session.defaultSession.emit("spellcheck-dictionary-initialized", "en-US");
  });
  await expect.poll(() => underlined(h.page)).not.toContain(MADE_UP);
});

test("the toast's Undo takes the word back out", async () => {
  await addMadeUp();
  await h.page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => underlined(h.page)).toContain(MADE_UP);
  await expect.poll(offered).toBe(true);
});

test("switched off in Settings, every line goes and the menu offers no spellings", async () => {
  await h.page.keyboard.press(`${MOD}+Comma`);
  await h.page.getByRole("switch", { name: "Check spelling" }).click();
  await h.page.keyboard.press("Escape");
  await expect.poll(() => underlined(h.page)).toEqual([]);
  await rightClick(h.page, "recieve");
  await expect(h.page.locator(".editor-context-menu")).toBeVisible();
  expect((await rows(h.page))[0]).toMatch(/^Cut/);
  await closeMenu(h.page);
});

test("on a Mac, a Spanish paragraph's word gets Spanish guesses", async () => {
  test.skip(!isMac, "the paragraph's language is a Mac's; elsewhere the chosen languages");
  await rightClick(h.page, "recivir");
  await expect.poll(async () => (await rows(h.page))[0]).toBe("recibir");
  await closeMenu(h.page);
});
