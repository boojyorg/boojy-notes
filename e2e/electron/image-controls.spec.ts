/**
 * The image block's controls (2026-09-23, from a prototype judged against
 * Obsidian's and Notion's): a click selects, a double-click opens the
 * full-size view under the file's name, and the pill on the right edge
 * resizes, writing the width into the file and taking it off again at the
 * picture's own size.
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

/** Drag the resize pill `dx` pixels, checking the width label on the way. */
async function dragPill(page: Page, dx: number, label: string) {
  const img = await picture(page);
  await img.hover();
  const pill = page.getByTestId("image-resize-handle");
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  if (!box) throw new Error("no pill");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await expect(page.getByTestId("image-width-label")).toHaveText(label);
  await page.mouse.up();
  await expect(page.getByTestId("image-width-label")).toHaveCount(0);
}

test("a click selects without opening the full-size view; a double-click opens it under the file's name", async () => {
  const h = await seed("Shot (2).png", 300, 120);
  try {
    await h.openNote("Pics");
    const img = await picture(h.page);

    await img.click();
    await expect(h.page.getByTestId("image-selection-wash")).toBeVisible();
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

test("the pill writes a width into the file, and dragging back to the picture's own size takes it off", async () => {
  const h = await seed("Pic.png", 400, 100);
  try {
    await h.openNote("Pics");
    const file = h.vault.file("Pics.md");

    await dragPill(h.page, -150, "250 px");
    await waitForFile(file, (t) => t.includes("![[Pic.png|250]]"), {
      label: "the width to be written",
    });

    // 396 is within the snap of the picture's 400: the label says so, and the
    // width comes off the file rather than being written as |400.
    await dragPill(h.page, 146, "400 px · original size");
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
    const wash = h.page.getByTestId("image-selection-wash");
    const box = await img.boundingBox();
    if (!box) throw new Error("no picture");

    // Beside the picture, in its own row. Before: the whole row counted as
    // the picture, so it stayed selected with its controls up.
    await img.click();
    await expect(wash).toBeVisible();
    await h.page.mouse.click(box.x + box.width + 60, box.y + box.height / 2);
    await expect(wash).toHaveCount(0);
    await expect(h.page.getByTestId("image-hover-bar")).toHaveCount(0);

    // In the text, as before.
    await img.click();
    await expect(wash).toBeVisible();
    await h.page.locator('[data-block-type="p"]', { hasText: "Two" }).click();
    await expect(wash).toHaveCount(0);

    // Outside the editor: the sidebar's Notes label. Before: nothing there deselected.
    await img.click();
    await expect(wash).toBeVisible();
    await h.page.getByText("Notes", { exact: true }).first().click();
    await expect(wash).toHaveCount(0);

    // A press on the picture's own controls keeps it (the pill, pressed and
    // released without moving), and Backspace then deletes it.
    await img.click();
    await expect(wash).toBeVisible();
    await img.hover();
    await h.page.getByTestId("image-resize-handle").click();
    await expect(wash).toBeVisible();
    await h.page.keyboard.press("Backspace");
    await waitForFile(h.vault.file("Pics.md"), (t) => !t.includes("Pic.png"), {
      label: "the selected picture to be deleted",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
