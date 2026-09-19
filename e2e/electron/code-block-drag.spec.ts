/**
 * The gutter grip lifts a code block, and the boundary above one is a place
 * another block can be dropped.
 *
 * Reproduces a bug found live on 2026-09-19, the same shape as the image one
 * fixed on 2026-09-16: the grip showed beside a code block (the handle finds
 * blocks in the DOM), but the press did nothing, because the drag looks the
 * block up in the editor's ref map and the code wrapper never registered
 * there. A code block could not be moved at all — the keyboard reorder needs
 * a caret, and the block's own textarea keeps every key it is given. The drop
 * geometry skipped it too, so a block could not be dropped above the first
 * code block in a note. Needs the real app: the grip, the drag threshold and
 * the drop are pointer geometry on the rendered column.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, expectNoTempFiles, launchApp, sleep, waitForFile } from "./harness";

const FENCE = "```js\nconst a = 1;\n```";

const seed = () => launchApp({ "Code.md": `One\n${FENCE}\nTwo\n` });

type Page = import("@playwright/test").Page;

/** The note's one code block, or the paragraph holding `text`. */
const block = (page: Page, which: "code" | string) =>
  which === "code"
    ? page.locator('[data-block-type="code"]')
    : page.locator('[data-block-type="p"]', { hasText: which });

/** Lift `from` by its grip and drop it just inside the top of `to`. */
async function dragByGrip(page: Page, from: "code" | string, to: "code" | string) {
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

/** The note's top-level block types, in order. */
const blockTypes = (page: Page) =>
  page
    .locator("[data-editor] > [data-block-id]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.blockType));

/** The file's lines, blank ones left out: the order is what is under test. */
const lines = (t: string) => t.split("\n").filter((l) => l.trim() !== "");

test("a code block lifted by its grip drops above the paragraph before it", async () => {
  const h = await seed();
  try {
    await h.openNote("Code");
    await expect(h.page.locator('[data-block-type="code"]')).toHaveCount(1);
    // The note ends with the empty paragraph the editor keeps under the last block.
    expect(await blockTypes(h.page)).toEqual(["p", "code", "p", "p"]);

    await dragByGrip(h.page, "code", "One");

    // Before: the ghost never appeared, the pointer-up was a no-op and the
    // file kept its order.
    await waitForFile(h.vault.file("Code.md"), (t) => t.startsWith("```js"), {
      label: "the fence to be written first",
    });
    expect(lines(h.vault.read("Code.md"))).toEqual(["```js", "const a = 1;", "```", "One", "Two"]);
    expect(await blockTypes(h.page)).toEqual(["code", "p", "p", "p"]);
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the code block's own band counts for the drop: a paragraph can land above it", async () => {
  const h = await seed();
  try {
    await h.openNote("Code");
    await expect(h.page.locator('[data-block-type="code"]')).toHaveCount(1);

    // Lift "Two" and release with the pointer just inside the code block's
    // top edge, so the boundary is the one above it. Before, the code block
    // had no ref, the drop loop never saw its band, and the first boundary it
    // could find was above "Two" itself: the drop changed nothing.
    await dragByGrip(h.page, "Two", "code");
    await waitForFile(h.vault.file("Code.md"), (t) => lines(t)[1] === "Two", {
      label: "Two to be written above the fence",
    });
    await sleep(SETTLE_MS);

    expect(lines(h.vault.read("Code.md"))).toEqual(["One", "Two", "```js", "const a = 1;", "```"]);
    expect(await blockTypes(h.page)).toEqual(["p", "p", "code", "p"]);
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
