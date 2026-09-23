/**
 * Enter and Backspace at a block's edges (2026-09-23). Backspace at the start
 * of a heading, list item, quote or task makes it a paragraph first and keeps
 * the text; an empty row under a divider or picture goes and the block is
 * selected in the same press; Enter at the start of a heading opens a
 * paragraph above and leaves the heading alone; a merge puts the caret at the
 * seam in visible characters.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, START_OF_LINE, launchApp, sleep, waitForFile } from "./harness";

const caretBlock = (page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
    const block = el?.closest("[data-block-type]");
    return block ? `${block.getAttribute("data-block-type")}:${block.textContent}` : null;
  });

test("Backspace at the start of a heading makes it a paragraph, and Enter there opens one above", async () => {
  const h = await launchApp({ "Alpha.md": "Intro\n\n### Title\n" });
  try {
    await h.openNote("Alpha");
    const heading = h.page.locator('[data-block-type="h3"]');
    await heading.click();
    await h.page.keyboard.press(START_OF_LINE);

    await h.page.keyboard.press("Enter");
    await expect(heading).toHaveText("Title");
    expect(await caretBlock(h.page)).toBe("h3:Title");

    await h.page.keyboard.press("Backspace");
    await expect(heading).toHaveCount(0);
    expect(await caretBlock(h.page)).toBe("p:Title");
    await h.page.keyboard.type("A ");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("A Title"));
    await sleep(SETTLE_MS);
    // The heading's marker is gone; the paragraph Enter opened above stays.
    const file = h.vault.read("Alpha.md");
    expect(file).not.toContain("#");
    expect(file).toMatch(/^Intro\n\n+A Title\n$/);
  } finally {
    await h.close();
  }
});

test("an empty heading under a divider: a paragraph first, then the row goes and the divider is selected", async () => {
  const h = await launchApp({ "Alpha.md": "Intro\n\n---\n### \n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator('[data-block-type="h3"]').click();
    await h.page.keyboard.press("Backspace");
    expect(await caretBlock(h.page)).toBe("p:");

    await h.page.keyboard.press("Backspace");
    // Intro and the note's trailing row are the paragraphs left.
    await expect(h.page.locator('[data-block-type="p"]')).toHaveCount(2);
    await expect(h.page.locator('[data-block-type="spacer"][data-selected="true"]')).toHaveCount(1);
    // The divider survives the second press: only the third removes it.
    await expect(h.page.locator('[data-block-type="spacer"]')).toHaveCount(1);
  } finally {
    await h.close();
  }
});

test("a merge puts the caret after the bold word, not inside the moved text", async () => {
  const h = await launchApp({ "Alpha.md": "Hello **bold**\n\nWorld\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator('[data-block-type="p"]', { hasText: "World" }).click();
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    // At the seam: typing at the end of bold extends it, as in every editor.
    // Before, the caret sat four characters (the `**` pair) into "World".
    expect(h.vault.read("Alpha.md")).toMatch(/^Hello \*\*boldX\*\*World\n/);
  } finally {
    await h.close();
  }
});
