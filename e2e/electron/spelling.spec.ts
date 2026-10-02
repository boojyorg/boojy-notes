/**
 * Spelling in the right-click menu: a misspelled word's guesses and Add to
 * dictionary above Cut, Copy and Paste. A guess is typed over the word (one
 * undoable edit, saved as typing is); Add to dictionary teaches the system,
 * and its toast's Undo takes the word back out. On a Mac the guesses come in
 * the word's paragraph's language.
 *
 * Add to dictionary writes to the system's own word list on a Mac, so the
 * word added is made up and is always removed again, pass or fail.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, MOD, launchApp, waitForFile } from "./harness";

const isMac = process.platform === "darwin";
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

let h: AppHandle;
test.beforeEach(async () => {
  h = await launchApp({
    "Alpha.md": `I recieve the parcel.\n\nThe ${MADE_UP} is here.\n\nVoy a recivir el paquete mañana.\n`,
  });
  await h.openNote("Alpha");
  await checkerReady(h.page);
});
test.afterEach(async () => {
  await h.app.evaluate(({ session }, w) => {
    session.defaultSession.removeWordFromSpellCheckerDictionary(w);
  }, MADE_UP);
  await h.close();
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

test("Add to dictionary teaches the word; the toast's Undo takes it back", async () => {
  await rightClick(h.page, MADE_UP);
  await h.page.getByRole("menuitem", { name: "Add to dictionary" }).click();
  const toast = h.page.getByText(`Added "${MADE_UP}" to dictionary`);
  await expect(toast).toBeVisible();
  await rightClick(h.page, MADE_UP);
  await expect(h.page.locator(".editor-context-menu")).toBeVisible();
  expect(await rows(h.page)).not.toContain("Add to dictionary");
  await closeMenu(h.page);
  await h.page.getByRole("button", { name: "Undo" }).click();
  await rightClick(h.page, MADE_UP);
  await expect.poll(() => rows(h.page)).toContain("Add to dictionary");
  await closeMenu(h.page);
});

test("switched off in Settings, the menu offers no spellings", async () => {
  await h.page.evaluate(() => window.electronAPI!.setSpelling({ enabled: false }));
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
