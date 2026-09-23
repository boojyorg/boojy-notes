/**
 * Image files dragged in from Finder land where they are dropped, anywhere on
 * the editor pane, and several land in the order given.
 *
 * Reproduces a report of 2026-09-23 ("can't drag and drop an image in"): the
 * drop handlers sat on the editable root, so only a release over the text
 * took a file. The space under a short note, the margins and the path band
 * refused the drag, and a release there did nothing. A file drag is
 * synthesised here (a DragEvent carrying a DataTransfer of Files), which runs
 * the app's own handlers; the OS drag session in front of them is Chromium's.
 * Several files at once could land out of order (each spliced at a fixed
 * index when its read finished, so the order test guards rather than
 * reproduces), and a paste of several kept only the first image.
 */
import { expect, test } from "@playwright/test";
import { dropFiles, launchApp, sleep, waitForFile } from "./harness";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const png = (name: string) => ({ name, bytes: Buffer.from(PNG_B64, "base64") });

type Page = import("@playwright/test").Page;

const lines = (t: string) => t.split("\n").filter((l) => l.trim() !== "");
const paragraph = (page: Page, text: string) =>
  page.locator('[data-block-type="p"]', { hasText: text });

test("an image dropped on the empty space under a short note is added at its end", async () => {
  const h = await launchApp({ "Pics.md": "One\n\nTwo\n" });
  try {
    await h.openNote("Pics");
    const two = await paragraph(h.page, "Two").boundingBox();
    const height = await h.page.evaluate(() => innerHeight);
    if (!two) throw new Error("no paragraph");

    // Far below the last block, in the pane but nowhere near the text.
    const drop = await dropFiles(h.page, [png("Below.png")], two.x + 40, height - 40);

    // Before: the pane refused the drag and the release wrote nothing.
    expect(drop.accepted).toBe(true);
    expect(drop.markerTop).not.toBeNull();
    expect(drop.markerGone).toBe(true);
    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[Below.png]]"), {
      label: "the dropped image to be written",
    });
    expect(lines(h.vault.read("Pics.md"))).toEqual(["One", "Two", "![[Below.png]]"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an image dropped over the top half of a paragraph lands above it", async () => {
  const h = await launchApp({ "Pics.md": "One\n\nTwo\n" });
  try {
    await h.openNote("Pics");
    const one = await paragraph(h.page, "One").boundingBox();
    const two = await paragraph(h.page, "Two").boundingBox();
    if (!one || !two) throw new Error("no paragraph");

    const drop = await dropFiles(h.page, [png("Between.png")], two.x + 20, two.y + 2);

    // The marker is drawn in the gap between the two, not through either.
    expect(drop.markerTop).toBeGreaterThan(one.y + one.height - 4);
    expect(drop.markerTop).toBeLessThan(two.y + 4);
    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[Between.png]]"), {
      label: "the dropped image to be written",
    });
    expect(lines(h.vault.read("Pics.md"))).toEqual(["One", "![[Between.png]]", "Two"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("several images dropped at once land in the order they were given", async () => {
  const h = await launchApp({ "Pics.md": "One\n" });
  try {
    await h.openNote("Pics");
    const one = await paragraph(h.page, "One").boundingBox();
    if (!one) throw new Error("no paragraph");

    await dropFiles(
      h.page,
      ["a.png", "b.png", "c.png"].map(png),
      one.x + 20,
      one.y + one.height - 2,
    );

    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[c.png]]"), {
      label: "the last image to be written",
    });
    await sleep(300);
    expect(lines(h.vault.read("Pics.md"))).toEqual([
      "One",
      "![[a.png]]",
      "![[b.png]]",
      "![[c.png]]",
    ]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("several image files pasted at once are all added, in order", async () => {
  const h = await launchApp({ "Pics.md": "One\n" });
  try {
    await h.openNote("Pics");
    await paragraph(h.page, "One").click();
    await h.page.keyboard.press("End");

    await h.page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      for (const name of ["a.png", "b.png"])
        data.items.add(new File([bytes], name, { type: "image/png" }));
      const target = document.getSelection()?.anchorNode?.parentElement ?? document.body;
      target.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, PNG_B64);

    // Before: only a.png was saved; b.png vanished without a word.
    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes("![[b.png]]"), {
      label: "the second pasted image to be written",
    });
    expect(lines(h.vault.read("Pics.md"))).toEqual(["One", "![[a.png]]", "![[b.png]]"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
