/**
 * The spelling line is laid over the text, never painted into it: a glyph
 * leaning past a misspelled word's edge (the y in "y.", where the font tucks
 * the full stop under it) is drawn whole, and the dots sit under the word.
 */
import { expect, test } from "@playwright/test";
import { MOD, launchApp } from "./harness";

test.skip(process.platform === "win32", "on Windows the line is Chromium's own");

test("a misspelled word's line clips no letter, and sits under the word", async () => {
  const h = await launchApp({ "Alpha.md": "The boojy. word and booojx here.\n" });
  try {
    await h.openNote("Alpha");
    const page = h.page;
    const dots = page.locator(".spelling-layer > i");
    await expect.poll(() => dots.count(), { timeout: 20_000 }).toBe(2);
    const word = await page.evaluate(() => {
      const t = document.querySelector("[data-editor] [data-block-id]")!.firstChild!;
      const at = t.textContent!.indexOf("boojy");
      const r = document.createRange();
      r.setStart(t, at);
      r.setEnd(t, at + "boojy.".length);
      const b = r.getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height };
    });
    // Under "boojy": from its first letter to its last, below the letters'
    // middle, never past the full stop's end.
    const line = (await dots.first().boundingBox())!;
    expect(line.x).toBeGreaterThanOrEqual(word.x - 1);
    expect(line.x + line.width).toBeLessThan(word.x + word.width);
    expect(line.y).toBeGreaterThan(word.y + word.height / 2);
    // "boojy." above the line is drawn the same with the line as without it.
    const clip = { ...word, height: line.y - word.y };
    const withLine = await page.screenshot({ clip });
    await page.addStyleTag({ content: ".spelling-layer { display: none }" });
    const without = await page.screenshot({ clip });
    expect(withLine.equals(without)).toBe(true);
  } finally {
    await h.close();
  }
});

test("at a larger interface size the line still sits under its word", async () => {
  const h = await launchApp({ "Alpha.md": "The boojy word here.\n" });
  try {
    await h.openNote("Alpha");
    const page = h.page;
    const dot = page.locator(".spelling-layer > i").first();
    await expect(dot).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press(`${MOD}+=`);
    await page.keyboard.press(`${MOD}+=`);
    await expect(page.locator("html")).not.toHaveCSS("zoom", "1");
    const word = () =>
      page.evaluate(() => {
        const t = document.querySelector("[data-editor] [data-block-id]")!.firstChild!;
        const at = t.textContent!.indexOf("boojy");
        const r = document.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + "boojy".length);
        const b = r.getBoundingClientRect();
        return { x: b.left, right: b.right, bottom: b.bottom };
      });
    await expect
      .poll(async () => {
        const [w, line] = [await word(), (await dot.boundingBox())!];
        return (
          Math.abs(line.x - w.x) < 1.5 &&
          Math.abs(line.x + line.width - w.right) < 1.5 &&
          line.y < w.bottom &&
          line.y > w.bottom - 10
        );
      })
      .toBe(true);
  } finally {
    await h.close();
  }
});
