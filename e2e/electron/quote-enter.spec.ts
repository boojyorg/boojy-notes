/**
 * Enter inside a quote. A quote continues on Enter, as in Obsidian and Notion:
 * the new line is a soft break inside the same block, which is the only thing
 * the file can hold (adjacent `> ` lines are one blockquote to every reader).
 * Enter on an empty line at the quote's end leaves it for a paragraph below.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, editorText, launchApp, sleep, waitForFile } from "./harness";

test("Enter in a quote is a new line of the same quote; Enter on its empty last line leaves it", async () => {
  const h = await launchApp({ "Alpha.md": "> Quote\n" });
  try {
    await h.openNote("Alpha");
    const quote = h.page.locator('[data-block-type="blockquote"]');
    await expect(quote).toHaveCount(1);
    await quote.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("Second line");

    // One bar, two lines, on screen and on disk.
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Second line"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("> Quote\n> Second line\n");
    await expect(quote).toHaveCount(1);

    // Enter twice: the first opens an empty line in the quote, the second
    // leaves it for a paragraph below, taking the empty line with it.
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("Outside");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Outside"));
    await sleep(SETTLE_MS);
    // A blank line under the quote, so no reader folds the paragraph into it.
    expect(h.vault.read("Alpha.md")).toBe("> Quote\n> Second line\n\nOutside\n");
    await expect(quote).toHaveCount(1);
    expect(await editorText(h.page)).toBe("Quote\nSecond line\nOutside\n");
    const type = await h.page.evaluate(() => {
      const node = window.getSelection()?.anchorNode;
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
      return el?.closest("[data-block-type]")?.getAttribute("data-block-type");
    });
    expect(type).toBe("p");
  } finally {
    await h.close();
  }
});

test("Enter in an empty quote turns it into a paragraph", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("> ");
    await expect(h.page.locator('[data-block-type="blockquote"]')).toHaveCount(1);
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator('[data-block-type="blockquote"]')).toHaveCount(0);
    await h.page.keyboard.type("Plain");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Plain"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nPlain\n");
  } finally {
    await h.close();
  }
});
