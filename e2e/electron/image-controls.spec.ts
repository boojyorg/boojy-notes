/**
 * The image block's controls (2026-09-23, from a prototype judged against
 * Obsidian's and Notion's): a click selects, a double-click opens the
 * full-size view under the file's name. Selected alone, a picture resizes by
 * the dots on its corners (2026-10-01; before, a pill on the right edge),
 * writing the width into the file and taking it off again at the picture's
 * own size.
 *
 * Before, a single click both selected the picture and opened the full-size
 * view, so a picture could not be selected to delete it. Needs the real app:
 * the resize is pointer travel on the laid-out picture, and the width is
 * proven on disk.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { makePng } from "../../tests/fixtures/makePng";
import { launchApp, waitForFile } from "./harness";

type Page = import("@playwright/test").Page;

const seed = (name: string, width: number, height: number) =>
  launchApp(
    { "Pics.md": `One\n![[${name}]]\nTwo\n` },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file(`attachments/${name}`), makePng(width, height));
      },
    },
  );

/** The picture, once it has loaded. */
async function picture(page: Page) {
  const img = page.locator('[data-block-type="image"] img');
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  return img;
}

/** The picture's drawn width in CSS pixels. */
const drawnWidth = (page: Page) =>
  page
    .locator('[data-block-type="image"] img')
    .evaluate((el: HTMLImageElement) => Math.round(el.getBoundingClientRect().width));

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Select the picture and return the centre of one of its corner dots. */
async function dot(page: Page, corner: Corner) {
  const img = await picture(page);
  const handle = page.locator(`[data-testid="image-resize-handle"][data-corner="${corner}"]`);
  if (!(await handle.isVisible())) await img.click();
  const box = await handle.locator("span").boundingBox();
  if (!box) throw new Error(`no ${corner} dot`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag a corner dot `dx` pixels; the picture is `width` wide before the release. */
async function dragDot(page: Page, corner: Corner, dx: number, width: number) {
  const { x, y } = await dot(page, corner);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await expect.poll(() => drawnWidth(page)).toBe(width);
  await page.mouse.up();
}

test("a press selects without opening the full-size view; a double-click opens it under the file's name", async () => {
  const h = await seed("Shot (2).png", 300, 120);
  try {
    await h.openNote("Pics");
    const img = await picture(h.page);

    // Selected on the press, before the release.
    const b = await img.boundingBox();
    if (!b) throw new Error("no picture");
    await h.page.mouse.move(b.x + 30, b.y + b.height / 2);
    await h.page.mouse.down();
    await expect(h.page.getByTestId("image-selection-outline")).toBeVisible();
    await h.page.mouse.up();
    await expect(h.page.getByTestId("image-selection-outline")).toBeVisible();
    // Before: the same click opened the full-size view.
    await expect(h.page.getByRole("dialog")).toHaveCount(0);

    await img.dblclick();
    const view = h.page.getByRole("dialog", { name: "Image: Shot (2).png" });
    await expect(view).toBeVisible();
    await expect(view.getByTestId("lightbox-name")).toHaveText("Shot (2).png");
    await view.getByRole("button", { name: "Close" }).click();
    await expect(h.page.getByRole("dialog")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a corner dot writes a width into the file, and dragging back to the picture's own size takes it off", async () => {
  const h = await seed("Pic.png", 400, 100);
  try {
    await h.openNote("Pics");
    const file = h.vault.file("Pics.md");

    await dragDot(h.page, "bottom-right", -150, 250);
    await waitForFile(file, (t) => t.includes("![[Pic.png|250]]"), {
      label: "the width to be written",
    });

    // A left dot counts its travel in reverse: dragged outward, to the left,
    // the picture grows. 396 is within the snap of the picture's 400: it lands
    // on 400, and the width comes off the file rather than being written as |400.
    await dragDot(h.page, "top-left", -146, 400);
    await waitForFile(file, (t) => t.includes("![[Pic.png]]"), {
      label: "the width to be taken off",
    });
    expect(fs.readFileSync(file, "utf8")).toBe("One\n![[Pic.png]]\nTwo\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a press anywhere off the picture deselects it: beside it in its row, the text, the sidebar", async () => {
  const h = await seed("Pic.png", 300, 120);
  try {
    await h.openNote("Pics");
    const img = await picture(h.page);
    const outline = h.page.getByTestId("image-selection-outline");
    const box = await img.boundingBox();
    if (!box) throw new Error("no picture");

    // Beside the picture, in its own row. Before: the whole row counted as
    // the picture, so it stayed selected with its controls up.
    await img.click();
    await expect(outline).toBeVisible();
    await h.page.mouse.click(box.x + box.width + 60, box.y + box.height / 2);
    await expect(outline).toHaveCount(0);
    await expect(h.page.getByTestId("image-hover-bar")).toHaveCount(0);

    // In the text, as before.
    await img.click();
    await expect(outline).toBeVisible();
    await h.page.locator('[data-block-type="p"]', { hasText: "Two" }).click();
    await expect(outline).toHaveCount(0);

    // Outside the editor: the sidebar's location name. Before: nothing there deselected.
    await img.click();
    await expect(outline).toBeVisible();
    await h.page.getByTestId("vault-label").click();
    await expect(outline).toHaveCount(0);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("menu", { name: "Storage location" })).toHaveCount(0);

    // A press on the picture's own controls keeps it (a dot, pressed and
    // released without moving), and Backspace then deletes it.
    await img.click();
    await expect(outline).toBeVisible();
    const corner = await dot(h.page, "bottom-right");
    await h.page.mouse.click(corner.x, corner.y);
    await expect(outline).toBeVisible();
    await h.page.keyboard.press("Backspace");
    await waitForFile(h.vault.file("Pics.md"), (t) => !t.includes("Pic.png"), {
      label: "the selected picture to be deleted",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a right-hand dot stays under the pointer through a drag; in a run of blocks the picture has no dots", async () => {
  // A portrait picture: its height follows its width, and its top-left holds
  // still, so the bottom-right corner moves both ways as the pointer does.
  const h = await seed("Tall.png", 300, 400);
  try {
    await h.openNote("Pics");
    const start = await dot(h.page, "bottom-right");
    await h.page.mouse.move(start.x, start.y);
    await h.page.mouse.down();
    await h.page.mouse.move(start.x - 60, start.y - 80, { steps: 6 });
    await expect.poll(() => drawnWidth(h.page)).toBe(240);
    const during = await dot(h.page, "bottom-right");
    expect(Math.abs(during.x - (start.x - 60))).toBeLessThan(1.5);
    expect(Math.abs(during.y - (start.y - 80))).toBeLessThan(1.5);
    await h.page.mouse.up();

    // Shift-click the paragraph below: the run holds both blocks, and the
    // picture wears the wash like the paragraph, with no dots to drag.
    await h.page
      .locator('[data-block-type="p"]', { hasText: "Two" })
      .click({ modifiers: ["Shift"] });
    await expect(h.page.getByTestId("image-selection-wash")).toBeVisible();
    await expect(h.page.getByTestId("image-resize-handle")).toHaveCount(0);
    await expect(h.page.getByTestId("image-selection-outline")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a menu item acts without moving the note, and leaves the picture unselected", async () => {
  // Reported 2026-09-23: Original size scrolled the note to the bottom and
  // left the picture selected. Closing the menu handed focus back to the
  // editor, and a plain focus() on a contentEditable spanning the note
  // scrolls it to its caret (useFocusTrap now hands back with preventScroll).
  const filler = (n: number, p: string) =>
    Array.from({ length: n }, (_, i) => `${p} ${i + 1}.`).join("\n\n");
  const body = [filler(20, "Before"), "![[Pic.png|200]]", filler(40, "After"), ""].join("\n\n");
  const h = await launchApp(
    { "Long.md": body },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file("attachments/Pic.png"), makePng(400, 100));
      },
    },
  );
  try {
    await h.openNote("Long");
    const img = await picture(h.page);
    await img.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const scroller = h.page.locator(".editor-scroll");
    const scrollTop = () => scroller.evaluate((el) => Math.round(el.scrollTop));
    const before = await scrollTop();
    expect(before).toBeGreaterThan(100);

    await img.click({ button: "right" });
    // The picture wears the wash while its menu is open.
    await expect(h.page.getByTestId("image-selection-wash")).toBeVisible();
    await h.page.getByRole("menuitem", { name: "Original size" }).click();
    await waitForFile(h.vault.file("Long.md"), (t) => t.includes("![[Pic.png]]"), {
      label: "the width to be taken off",
    });

    // A few frames for the caret rescue that used to run after the click.
    await h.page.waitForTimeout(300);
    expect(await scrollTop()).toBe(before);
    await expect(h.page.getByTestId("image-selection-wash")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
