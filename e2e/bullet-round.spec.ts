import { expect, type Page, test } from "@playwright/test";

// A bullet's dot and a nested item's ring stay round under any UI scale and
// screen density. A round box did not: Chromium rounds a box's width and
// height to device pixels apart, and a 6px dot came out 13×14 at 110% on a
// Retina screen (EditableBlock's bulletMarkerStyle paints a circle instead).

test.use({ deviceScaleFactor: 2 });

/** The ink's extent, in device pixels, of each marker as the screen shows it. */
async function markerExtents(page: Page) {
  const out: { w: number; h: number }[] = [];
  for (const marker of await page.locator("[data-marker]").all()) {
    const png = await marker.screenshot();
    out.push(
      await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let [minX, minY, maxX, maxY] = [c.width, c.height, -1, -1];
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            // Ink at half strength or more counts.
            if (data[(y * c.width + x) * 4] > 128) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        return { w: maxX - minX + 1, h: maxY - minY + 1 };
      }, png.toString("base64")),
    );
  }
  return out;
}

test("bullet dots and rings are round at every UI scale", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Round");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("- One");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Two");
  await expect(page.locator("[data-marker]")).toHaveCount(2);

  for (const zoom of ["1", "1.1", "1.25"]) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = z;
    }, zoom);
    const [dot, ring] = await markerExtents(page);
    expect(dot.w, `dot at ${zoom}`).toBe(dot.h);
    expect(ring.w, `ring at ${zoom}`).toBe(ring.h);
    expect(dot.w).toBeGreaterThan(9);
  }
});
