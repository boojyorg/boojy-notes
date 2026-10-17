/**
 * A format wraps the selection's text, never the spaces at its edges: bold on
 * "The " wrote `**The ** cat` to the file, which no Markdown reader (Obsidian
 * included) takes for bold. Windows' double-click always takes the word's
 * trailing space, and a drag can on any system.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Draft.md";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: "The cat sat here\n" });
  await h.openNote("Draft");
});

test.afterEach(async () => {
  await h?.close();
});

/** Select characters [from, to) of the paragraph's text, with the editor focused. */
async function select(from: number, to: number) {
  const p = h.page.locator('[data-block-type="p"]').first();
  await p.click();
  await p.evaluate(
    (el, [a, b]) => {
      const text = el.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, a);
      range.setEnd(text, b);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
    [from, to],
  );
}

test("bold on a word with its trailing space wraps the word alone", async () => {
  await select(0, 4);
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe("The ");
  await h.page.keyboard.press(`${MOD}+b`);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("**"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("**The** cat sat here\n");
  expect(h.pageErrors).toEqual([]);
});

test("italic on words with spaces at both ends wraps the words alone", async () => {
  await select(3, 12);
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe(" cat sat ");
  await h.page.keyboard.press(`${MOD}+i`);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("*"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The *cat sat* here\n");
  expect(h.pageErrors).toEqual([]);
});

/** Put the caret at the end of the paragraph, with the editor focused. */
async function caretAtEnd() {
  const p = h.page.locator('[data-block-type="p"]').first();
  await p.click();
  await h.page.keyboard.press("End");
}

test("bold turned on at the caret, then a space, keeps the space outside the bold", async () => {
  await caretAtEnd();
  await h.page.keyboard.press(`${MOD}+b`);
  await h.page.keyboard.type(" word");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("word"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The cat sat here **word**\n");
  expect(h.pageErrors).toEqual([]);
});

test("bold turned off after a space keeps the space outside the bold", async () => {
  await caretAtEnd();
  await h.page.keyboard.press(`${MOD}+b`);
  await h.page.keyboard.type(" word ");
  await h.page.keyboard.press(`${MOD}+b`);
  await h.page.keyboard.type("next");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("next"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The cat sat here **word** next\n");
  expect(h.pageErrors).toEqual([]);
});

test("italic turned on mid-line, then a space, keeps the space outside the italic", async () => {
  const p = h.page.locator('[data-block-type="p"]').first();
  await p.click();
  await p.evaluate((el) => window.getSelection()?.collapse(el.firstChild, 3));
  await h.page.keyboard.press(`${MOD}+i`);
  await h.page.keyboard.type(" big");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("big"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The *big* cat sat here\n");
  expect(h.pageErrors).toEqual([]);
});

test("bold and italic turned on together keep the first space outside both", async () => {
  await caretAtEnd();
  await h.page.keyboard.press(`${MOD}+b`);
  await h.page.keyboard.press(`${MOD}+i`);
  await h.page.keyboard.type(" word");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("word"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The cat sat here ***word***\n");
  expect(h.pageErrors).toEqual([]);
});
