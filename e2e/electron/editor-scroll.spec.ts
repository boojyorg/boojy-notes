/**
 * A note opens at its top (2026-09-20). The editor's scroller is shared
 * between notes and the path band is sticky inside it, so a scroll left by
 * the previous note put the next note's first line under the band, off the
 * New note baseline. The scroll is the real scroller's, so it is proven here.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("switching notes resets the editor's scroll, so the first line sits where a fresh note's does", async () => {
  const long = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  const h = await launchApp({ "Long.md": `${long}\n`, "Short.md": "Short.\n" });
  try {
    await h.openNote("Short");
    const fresh = (await h.page.locator("[data-block-id]").first().boundingBox())!.y;

    await h.openNote("Long");
    const scroller = h.page.locator(".editor-scroll");
    await scroller.hover();
    await h.page.mouse.wheel(0, 600);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);

    await h.openNote("Short");
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
    expect((await h.page.locator("[data-block-id]").first().boundingBox())!.y).toBeCloseTo(
      fresh,
      0,
    );
  } finally {
    await h.close();
  }
});
