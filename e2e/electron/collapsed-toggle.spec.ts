/**
 * With the sidebar hidden, the panel toggle is pinned to the viewport's
 * top-left corner (right of the traffic lights on macOS) and the note's name
 * sits on the same row. The name steps around the toggle, whatever the window
 * width: review H12 found it measured from the web inset, so on macOS the
 * glyph was drawn over the first letters at 1,200px and at 700px alike. This
 * spec is a real guard on macOS and a plain layout check elsewhere.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("the collapsed toggle never overlaps the note's name, wide or narrow", async () => {
  const h = await launchApp({ "Link end.md": "Alpha.\n" });
  try {
    await h.openNote("Link end");
    await h.page.getByTitle("Hide sidebar").click();
    const toggle = h.page.getByTitle("Show sidebar");
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(toggle).toBeVisible();

    for (const width of [1200, 700]) {
      await h.app.evaluate(({ BrowserWindow }, w) => {
        BrowserWindow.getAllWindows()[0].setSize(w, 800);
      }, width);
      await expect
        .poll(async () => await h.page.evaluate(() => window.innerWidth), { timeout: 5000 })
        .toBe(width);
      const t = await toggle.boundingBox();
      const n = await title.boundingBox();
      expect(t, `toggle box at ${width}`).not.toBeNull();
      expect(n, `title box at ${width}`).not.toBeNull();
      // The label's pill starts right of the toggle's box, with air between.
      expect(n!.x, `title left at ${width}`).toBeGreaterThanOrEqual(t!.x + t!.width + 8);
      // Same row: the toggle's centre falls within the label's line box.
      const toggleMid = t!.y + t!.height / 2;
      expect(toggleMid).toBeGreaterThan(n!.y);
      expect(toggleMid).toBeLessThan(n!.y + n!.height);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
