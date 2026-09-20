/**
 * A `#tag` is drawn as a pill, and typing after it stays outside the pill
 * (2026-09-20). A text-only edit never repaints the block, so a character
 * typed at the end of the tag's span lands inside it; a letter is the tag
 * growing, but a space or punctuation would sit in the pill until the next
 * repaint. The `beforeinput` seam moves the caret out for those, as it does
 * for a link. Asserted on the DOM and on the file.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, launchApp, noteText, waitForFile } from "./harness";

test("a tag is a pill from its first letter; a space after it is prose, a letter grows it", async () => {
  const h = await launchApp({ "Note.md": "see #todd\n" });
  try {
    const page = h.page;
    await h.openNote("Note");
    const block = page.locator("[data-block-id]").first();
    const pill = block.locator(".inline-tag");
    await expect(pill).toHaveText("#todd");
    // The pill has a ground of its own (the neutral surface, never the accent).
    const bg = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");

    await block.click();
    await page.keyboard.press(END_OF_LINE);
    await page.keyboard.type(" after");
    await expect(pill).toHaveText("#todd");
    await expect.poll(() => noteText(page)).toBe("see #todd after");
    await waitForFile(h.vault.file("Note.md"), (t) => t === "see #todd after\n");

    // A letter at the tag's end continues the tag, on screen and on disk.
    await block.click();
    await page.keyboard.press(END_OF_LINE);
    for (let i = 0; i < " after".length; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("y");
    await expect.poll(() => noteText(page)).toBe("see #toddy");
    await waitForFile(h.vault.file("Note.md"), (t) => t === "see #toddy\n");

    // A new tag is a pill from its first letter, grows with the next ones,
    // and a space ends it.
    await page.keyboard.type(" #n");
    await expect(block.locator(".inline-tag")).toHaveCount(2);
    await expect(block.locator(".inline-tag").nth(1)).toHaveText("#n");
    await page.keyboard.type("ew and");
    await expect(block.locator(".inline-tag").nth(1)).toHaveText("#new");
    await expect.poll(() => noteText(page)).toBe("see #toddy #new and");
    await waitForFile(h.vault.file("Note.md"), (t) => t === "see #toddy #new and\n");

    // A click on a tag that grew by typing searches its whole name.
    await block.locator(".inline-tag").nth(1).click();
    await expect(page.getByTestId("search-tag-chip")).toHaveText(/#new$/);
    await page.keyboard.press("Escape");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
