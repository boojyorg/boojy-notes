/**
 * Bold on a selection inside a heading makes the word heavier and writes its
 * `**` to the file; a second press takes both back. Before 2026-09-16 the
 * press went through execCommand("bold"), which read the heading's computed
 * weight as "already bold" and removed it instead: the word went lighter on
 * screen and the file never changed.
 *
 * Needs the real app: the fault was Chromium's own editing command, which
 * jsdom does not implement.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Draft.md";
const FILE = "## Release day\n\nBody text\n";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: FILE });
  await h.openNote("Draft");
});

test.afterEach(async () => {
  await h?.close();
});

/** Select characters [from, to) of the heading's own text, with the editor focused. */
async function selectInHeading(page: AppHandle["page"], from: number, to: number) {
  const h2 = page.locator('[data-block-type="h2"]');
  await h2.click();
  await h2.evaluate(
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

test("bold on a word in a heading makes it heavier and writes the stars; a second press takes both back", async () => {
  const h2 = h.page.locator('[data-block-type="h2"]');
  await selectInHeading(h.page, 8, 11);
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe("day");

  await h.page.keyboard.press(`${MOD}+b`);
  await expect(h2.locator("strong")).toHaveText("day");
  const [heading, word] = await h2.evaluate((el) => [
    Number(getComputedStyle(el).fontWeight),
    Number(getComputedStyle(el.querySelector("strong") as Element).fontWeight),
  ]);
  expect(word).toBeGreaterThan(heading);

  await waitForFile(h.vault.file(NOTE), (t) => t.includes("**"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("## Release **day**\n\nBody text\n");

  // The selection is still the word; the same press undoes the wrap.
  await h.page.keyboard.press(`${MOD}+b`);
  await expect(h2.locator("strong")).toHaveCount(0);
  await expect(h2).toHaveText("Release day");
  await waitForFile(h.vault.file(NOTE), (t) => !t.includes("**"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(FILE);
  expect(h.pageErrors).toEqual([]);
});
