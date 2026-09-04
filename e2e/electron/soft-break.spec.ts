/**
 * Soft breaks inside a paragraph. Shift+Enter puts a line break inside the
 * current paragraph: on disk it is a plain newline between the two lines (a
 * conventional soft break), and on screen it stays a visible line break
 * through every repaint, with typing after it landing where the caret shows.
 *
 * Reproduces the foundation gap for the paragraph model: Chromium's own
 * Shift+Enter already wrote the newline to disk, but the paragraph renderer
 * never turned a newline back into a line break, so the next repaint (a note
 * switch, an undo) collapsed "one⏎two" into "one two" on screen.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, editorText, launchApp, sleep, waitForFile } from "./harness";

test("Shift+Enter is a line break inside the paragraph, on disk and after a repaint", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n", "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    await h.page.keyboard.press("Shift+Enter");
    await h.page.keyboard.type("two");

    // Disk: a soft break is a newline, nothing more.
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("two"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha. one\ntwo\n");
    // Screen: two lines in one block.
    expect(await editorText(h.page)).toBe("Alpha. one\ntwo\n");
    expect(await h.page.locator("[data-block-id]").count()).toBe(2); // the paragraph + the file's trailing empty line

    // A repaint from state (leave and come back) keeps the line break.
    await h.openNote("Beta");
    await h.openNote("Alpha");
    expect(await editorText(h.page)).toBe("Alpha. one\ntwo\n");

    // Typing at the end of the second line lands there, not before the break.
    // The click lands on the first line; ArrowDown moves within the block.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha. one\ntwo!\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
