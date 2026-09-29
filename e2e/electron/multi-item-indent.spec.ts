/**
 * Tab and Shift+Tab over several list items move them all a level, whether
 * they are held by a text selection across them or selected whole. In is all
 * or nothing; out moves each item that can. One undo step per press, and the
 * selection stays for the next press. Keys across block roots, so proven in
 * the real app.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp, MOD, waitForFile } from "./harness";

let h: AppHandle;

const NOTE = "- Alpha\n- Bravo\n- Charlie\n- Delta\n";
const IN = "- Alpha\n  - Bravo\n  - Charlie\n  - Delta\n";

const item = (page: Page, text: string) =>
  page.getByRole("textbox", { name: "Bullet item" }).filter({ hasText: text });

/** A text selection from the start of Bravo into Delta. */
async function selectTextBravoToDelta(page: Page) {
  await item(page, "Bravo").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+End");
}

test.beforeEach(async () => {
  h = await launchApp({ "List.md": NOTE });
  await h.openNote("List");
  await item(h.page, "Alpha").waitFor();
});

test.afterEach(async () => {
  expect(h.pageErrors).toEqual([]);
  await h.close();
});

test("a text selection across items: Tab moves them all in, Shift+Tab out, one undo each", async () => {
  await selectTextBravoToDelta(h.page);
  await h.page.keyboard.press("Tab");
  await waitForFile(h.vault.file("List.md"), (text) => text === IN);
  // The selection stayed, so the next press acts on the same items.
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toContain("Charlie");
  // Nothing above Bravo to nest under at depth 1: nothing moves.
  await h.page.keyboard.press("Tab");
  await h.page.keyboard.press("Shift+Tab");
  await waitForFile(h.vault.file("List.md"), (text) => text === NOTE);
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("List.md"), (text) => text === IN);
});

test("a whole-block selection of items moves as one and stays selected", async () => {
  await item(h.page, "Bravo").click();
  await h.page.keyboard.press("Escape");
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.keyboard.press("Tab");
  await waitForFile(h.vault.file("List.md"), (text) => text === IN);
  await h.page.keyboard.press("Shift+Tab");
  await waitForFile(h.vault.file("List.md"), (text) => text === NOTE);
});

test("when the first item cannot nest, nothing moves and focus stays in the note", async () => {
  await item(h.page, "Alpha").click();
  await h.page.keyboard.press("Home");
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.keyboard.press("Tab");
  await h.page.keyboard.press("Shift+Tab");
  await h.page.waitForTimeout(600);
  expect(h.vault.read("List.md")).toBe(NOTE);
  expect(await h.page.evaluate(() => !!document.activeElement?.closest("[data-editor]"))).toBe(
    true,
  );
});
