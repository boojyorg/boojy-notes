/**
 * The gutter grip lifts an image as it lifts a paragraph or a divider.
 *
 * Reproduces a bug found live on 2026-09-16: the grip showed beside an image
 * (the handle finds blocks in the DOM), but the press did nothing, because
 * the drag looks the block up in the editor's ref map and only text roots,
 * the divider and the table registered there. The image's wrapper never did,
 * so `activateBlockDrag` returned before the ghost was made. Needs the real
 * app: the grip, the drag threshold and the drop are pointer geometry on the
 * rendered column.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { SETTLE_MS, expectNoTempFiles, launchApp, sleep, waitForFile } from "./harness";

const IMAGE = "![[pic.png]]";
// A 1x1 PNG, so the image block has a real picture and no load error.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const seed = () =>
  launchApp(
    { "Pics.md": `One\n${IMAGE}\nTwo\n` },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file("attachments/pic.png"), PNG);
      },
    },
  );

type Page = import("@playwright/test").Page;

/** The block root holding `text`, or the note's one image. */
const block = (page: Page, which: "image" | string) =>
  which === "image"
    ? page.locator('[data-block-type="image"]')
    : page.locator('[data-block-type="p"]', { hasText: which });

/** Lift `from` by its grip and drop it just above `to`. */
async function dragByGrip(page: Page, from: "image" | string, to: "image" | string) {
  const fromBox = await block(page, from).boundingBox();
  const toBox = await block(page, to).boundingBox();
  if (!fromBox || !toBox) throw new Error("blocks not visible");
  const fromId = await block(page, from).getAttribute("data-block-id");
  const grip = page.locator(`[data-testid="block-drag-handle"][data-target-block="${fromId}"]`);
  // The grip follows the pointer on an animation frame (the window is shown
  // on CI so frames tick there; see harness.ts).
  await page.mouse.move(fromBox.x + 40, fromBox.y + Math.min(12, fromBox.height / 2));
  await grip.waitFor({ timeout: 2_000 });
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error("grip not visible");
  const gx = gripBox.x + gripBox.width / 2;
  const gy = gripBox.y + gripBox.height / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  // The drag lifts on the first real movement; carry only once it has.
  await page.mouse.move(gx, gy - 8, { steps: 2 });
  await page.waitForFunction(() => document.body.classList.contains("block-dragging"), null, {
    timeout: 2_000,
  });
  await page.mouse.move(gx, toBox.y + 2, { steps: 4 });
  await sleep(50);
  await page.mouse.up();
}

const lines = (t: string) => t.split("\n").filter((l) => l.trim() !== "");

test("an image lifted by its grip drops above the paragraph before it", async () => {
  const h = await seed();
  try {
    await h.openNote("Pics");
    await expect(h.page.locator('[data-block-type="image"]')).toHaveCount(1);

    await dragByGrip(h.page, "image", "One");

    // Before: the ghost never appeared, the pointer-up was a no-op and the
    // file kept its order.
    await waitForFile(h.vault.file("Pics.md"), (t) => lines(t)[0] === IMAGE, {
      label: "the image to be written first",
    });
    expect(lines(h.vault.read("Pics.md"))).toEqual([IMAGE, "One", "Two"]);
    expect(await h.page.locator("[data-block-id]").first().getAttribute("data-block-type")).toBe(
      "image",
    );
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the image's own band counts for the drop: releasing over its top half leaves the order alone", async () => {
  const h = await seed();
  try {
    await h.openNote("Pics");
    await expect(h.page.locator('[data-block-type="image"]')).toHaveCount(1);

    // Lift "One" and release with the pointer just inside the image's top
    // edge: above the image's middle, so the boundary is the one above the
    // image, which is where "One" already is. Before, the image had no ref,
    // the drop loop never saw its band, and the first boundary it found was
    // above "Two": the drop put "One" under the image.
    await dragByGrip(h.page, "One", "image");
    await sleep(SETTLE_MS);

    expect(lines(h.vault.read("Pics.md"))).toEqual(["One", IMAGE, "Two"]);
    expect(await h.page.locator("[data-block-id]").first().getAttribute("data-block-type")).toBe(
      "p",
    );
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
