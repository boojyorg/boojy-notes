/**
 * A note opened again draws its pictures in its first paint. The browser
 * already holds them, but the load event comes a frame later, so each picture
 * showed its grey placeholder for a frame and the text below it jumped.
 * Needs the real app: the frames are Chromium's.
 */
import fs from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { makePng } from "../../tests/fixtures/makePng";
import { launchApp } from "./harness";

/**
 * Every frame from now until the pictures are shown, with whether any image
 * block was still waiting on its picture (the placeholder up).
 */
const watchFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ waiting: boolean; shown: number }[]>((resolve) => {
        const frames: { waiting: boolean; shown: number }[] = [];
        const start = performance.now();
        const tick = () => {
          const imgs = [
            ...document.querySelectorAll<HTMLImageElement>('[data-block-type="image"] img'),
          ];
          const shown = imgs.filter((img) => getComputedStyle(img).opacity === "1").length;
          frames.push({ waiting: shown < imgs.length, shown });
          if (shown === 2 || performance.now() - start > 3000) resolve(frames);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );

test("a note opened again shows its pictures in the first frame they are drawn", async () => {
  const h = await launchApp(
    { "Pics.md": "Before\n\n![[one.png]]\n\n![[two.png]]\n\nAfter\n", "Plain.md": "Text\n" },
    {
      prepare: (vault) => {
        fs.writeFileSync(vault.file("one.png"), makePng(1200, 700));
        fs.writeFileSync(vault.file("two.png"), makePng(800, 400));
      },
    },
  );
  try {
    await h.openNote("Pics");
    await expect(h.page.locator('[data-block-type="image"] img')).toHaveCount(2);
    await expect.poll(() => watchFrames(h.page).then((f) => f.at(-1)?.shown)).toBe(2);
    await h.openNote("Plain");
    await expect(h.page.locator('[data-block-type="image"]')).toHaveCount(0);

    const frames = watchFrames(h.page);
    await h.openNote("Pics");
    const seen = await frames;
    expect(seen.at(-1)?.shown).toBe(2);
    // Before: one frame with both blocks still on their placeholders.
    expect(seen.filter((f) => f.waiting)).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
