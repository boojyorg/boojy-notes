/**
 * An image is drawn at a sensible size: a Retina screenshot at the width it
 * had on screen, a small picture at its own size, a width in the file in
 * pixels, and nothing wider than the column.
 *
 * Reported 2026-09-23 ("images dragged in are too large"): every image
 * without a width filled the column, so a 60px icon was stretched to the
 * column's 720 and a 2× screenshot drawn larger than it was captured. Needs
 * the real app: the width is decided from the file's bytes at insertion and
 * from the laid-out picture on screen.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { makePng } from "../../tests/fixtures/makePng";
import { dropFiles, launchApp, waitForFile } from "./harness";

type Page = import("@playwright/test").Page;

/** Each image's drawn width in CSS pixels, once every picture has loaded. */
const drawnWidths = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('[data-block-type="image"] img')].map((img) =>
      img.complete && img.naturalWidth > 0
        ? Math.round(img.getBoundingClientRect().width / (img.currentCSSZoom || 1))
        : -1,
    ),
  );

/** The editable column's width in CSS pixels. */
const columnWidth = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[contenteditable="true"][role="region"]');
    return root ? Math.round(root.getBoundingClientRect().width / (root.currentCSSZoom || 1)) : 0;
  });

test("a Retina screenshot dropped in is drawn, and written, at its on-screen width", async () => {
  const h = await launchApp({ "Pics.md": "One\n" });
  try {
    await h.openNote("Pics");
    const one = await h.page.locator('[data-block-type="p"]', { hasText: "One" }).boundingBox();
    if (!one) throw new Error("no paragraph");

    // 800 pixels saved at 144 dpi: 400 wide on the screen it was taken on.
    await dropFiles(
      h.page,
      [{ name: "Shot.png", bytes: makePng(800, 60, 144) }],
      one.x + 20,
      one.y + one.height,
    );

    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[Shot.png"), {
      label: "the dropped screenshot to be written",
    });
    // The width goes into the file, so Obsidian draws it the same size.
    expect(h.vault.read("Pics.md")).toContain("![[Shot.png|400]]");
    // Before: drawn the column's full width, ~720.
    await expect.poll(() => drawnWidths(h.page)).toEqual([400]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a small picture is drawn at its own size and gains no width in the file", async () => {
  const h = await launchApp({ "Pics.md": "One\n" });
  try {
    await h.openNote("Pics");
    const one = await h.page.locator('[data-block-type="p"]', { hasText: "One" }).boundingBox();
    if (!one) throw new Error("no paragraph");

    await dropFiles(
      h.page,
      [{ name: "Icon.png", bytes: makePng(60, 60) }],
      one.x + 20,
      one.y + one.height,
    );

    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[Icon.png"), {
      label: "the dropped icon to be written",
    });
    expect(h.vault.read("Pics.md")).toContain("![[Icon.png]]");
    // Before: stretched to the column's full width.
    await expect.poll(() => drawnWidths(h.page)).toEqual([60]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("images already in a note: a file width is pixels, and a large picture stops at the column", async () => {
  const note = "![[Wide.png]]\n![[Sized.png|300]]\n";
  const h = await launchApp(
    { "Pics.md": note },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file("attachments/Wide.png"), makePng(2000, 40));
        fs.writeFileSync(vault.file("attachments/Sized.png"), makePng(2000, 40));
      },
    },
  );
  try {
    await h.openNote("Pics");
    const column = await columnWidth(h.page);
    expect(column).toBeGreaterThan(300);
    // Wide: capped at the column, less the 2px frame either side.
    // Sized: `|300` is 300px, as Obsidian reads it; before, 300 / 7 = 43% of the column.
    await expect.poll(() => drawnWidths(h.page)).toEqual([column - 4, 300]);
    // Reading and drawing rewrites nothing.
    expect(h.vault.read("Pics.md")).toBe(note);
  } finally {
    await h.close();
  }
});
