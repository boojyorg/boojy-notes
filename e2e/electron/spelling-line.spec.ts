/**
 * The spelling line is laid over the text, never painted into it: a glyph
 * leaning past a misspelled word's edge (the y in "y.", where the font tucks
 * the full stop under it) is drawn whole, and the dots follow the word.
 *
 * The word is made up, so every system's checker rejects it; each test asks
 * the checker first, so a dictionary that knew it would fail here, not later.
 */
import { expect, type Page, test } from "@playwright/test";
import { MOD, launchApp } from "./harness";

test.skip(process.platform === "win32", "on Windows the line is Chromium's own");

const WORD = "Qwyxzly";

const rejected = (page: Page) =>
  expect
    .poll(
      () => page.evaluate((w) => window.electronAPI!.checkParagraphs!([`A ${w} here.`]), WORD),
      {
        timeout: 20_000,
      },
    )
    .toEqual([[WORD]]);

/** The word's box on screen, and its line's. */
const boxes = (page: Page, through = WORD) =>
  page.evaluate(
    ([w, end]) => {
      const walker = document.createTreeWalker(
        document.querySelector("[data-editor]")!,
        NodeFilter.SHOW_TEXT,
      );
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const at = t.textContent!.indexOf(w);
        if (at < 0) continue;
        const r = document.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + end.length);
        const b = r.getBoundingClientRect();
        const dot = document.querySelector<HTMLElement>(`.spelling-layer > i[data-word="${w}"]`);
        const d = dot?.getBoundingClientRect();
        return {
          word: { x: b.left, y: b.top, right: b.right, bottom: b.bottom, height: b.height },
          line: d ? { x: d.left, y: d.top, right: d.right } : null,
        };
      }
      throw new Error(`no ${w}`);
    },
    [WORD, through],
  );

/** The line runs under the word, from its first letter to its last. */
const underWord = async (page: Page) => {
  const { word, line } = await boxes(page);
  return (
    !!line &&
    Math.abs(line.x - word.x) < 1.5 &&
    Math.abs(line.right - word.right) < 1.5 &&
    line.y < word.bottom &&
    line.y > word.bottom - 10
  );
};

test("a misspelled word's line clips no letter, and sits under the word", async () => {
  const h = await launchApp({ "Alpha.md": `The ${WORD}. word here.\n` });
  try {
    await rejected(h.page);
    await h.openNote("Alpha");
    const page = h.page;
    await expect.poll(() => underWord(page), { timeout: 20_000 }).toBe(true);
    // "Qwyxzly." above the line is drawn the same with the line as without it.
    const { word, line } = await boxes(page, `${WORD}.`);
    const clip = { x: word.x, y: word.y, width: word.right - word.x, height: line!.y - word.y };
    const withLine = await page.screenshot({ clip });
    await page.addStyleTag({ content: ".spelling-layer { display: none }" });
    const without = await page.screenshot({ clip });
    expect(withLine.equals(without)).toBe(true);
  } finally {
    await h.close();
  }
});

test("the line follows its word when the item is indented", async () => {
  const h = await launchApp({ "Alpha.md": `- First item\n- A ${WORD} item\n` });
  try {
    await rejected(h.page);
    await h.openNote("Alpha");
    const page = h.page;
    await expect.poll(() => underWord(page), { timeout: 20_000 }).toBe(true);
    const before = (await boxes(page)).word.x;
    await page.locator("[data-editor] [data-block-id]").nth(1).click();
    await page.keyboard.press("Tab");
    await expect.poll(async () => (await boxes(page)).word.x).toBeGreaterThan(before + 10);
    await expect.poll(() => underWord(page)).toBe(true);
  } finally {
    await h.close();
  }
});

test("at a larger interface size the line still sits under its word", async () => {
  const h = await launchApp({ "Alpha.md": `The ${WORD} word here.\n` });
  try {
    await rejected(h.page);
    await h.openNote("Alpha");
    const page = h.page;
    await expect.poll(() => underWord(page), { timeout: 20_000 }).toBe(true);
    await page.keyboard.press(`${MOD}+=`);
    await page.keyboard.press(`${MOD}+=`);
    await expect(page.locator("html")).not.toHaveCSS("zoom", "1");
    await expect.poll(() => underWord(page)).toBe(true);
  } finally {
    await h.close();
  }
});
