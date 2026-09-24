/**
 * The caret never rests beside a list marker, outside the item's text
 * (2026-09-24). A list item, a numbered item and a task are a row holding the
 * marker and the text; the row is inside the editor's contentEditable, so
 * Chromium would rest a caret in it (ArrowLeft from an item's start, a click
 * by the dot), and what was typed there was drawn beside the dot and never
 * reached the file. Needs the real app: the question is what the file holds.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, START_OF_LINE, launchApp, sleep, waitForFile } from "./harness";

/** The block the caret is in, and whether it is inside that block's text. */
const caretAt = (page) =>
  page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
    const block = el?.closest("[data-block-type]");
    if (!block) return null;
    // A row's text is the child beside the non-editable marker; a paragraph is its own text.
    const text =
      [...block.children].find(
        (c) =>
          c.getAttribute("contenteditable") !== "false" &&
          block.querySelector('[contenteditable="false"]'),
      ) ?? block;
    const where = text.contains(node as Node) ? "" : " (outside its text)";
    return `${block.getAttribute("data-block-type")}:${text.textContent}${where}`;
  });

test("ArrowLeft and ArrowRight cross between items through their text", async () => {
  const h = await launchApp({ "Alpha.md": "Intro\n\n- one\n- two\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator('[data-block-type="bullet"]').nth(1).getByRole("textbox").click();
    await h.page.keyboard.press(START_OF_LINE);

    // From the second item's start, back to the end of the first item.
    await h.page.keyboard.press("ArrowLeft");
    expect(await caretAt(h.page)).toBe("bullet:one");
    await h.page.keyboard.type("X");
    // And forward again, to the start of the second item's text.
    await h.page.keyboard.press("ArrowRight");
    expect(await caretAt(h.page)).toBe("bullet:two");
    await h.page.keyboard.type("Y");
    // From the first item's start, out to the row above: the blank line
    // before a list is an empty paragraph of its own.
    await h.page.keyboard.press("ArrowUp");
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("ArrowLeft");
    expect(await caretAt(h.page)).toBe("p:");
    // And from the paragraph's end, into the item's text rather than its row.
    await h.page.keyboard.press("ArrowRight");
    expect(await caretAt(h.page)).toBe("bullet:oneX");
    await h.page.keyboard.type("Z");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("ZoneX"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Intro\n\n- ZoneX\n- Ytwo\n");
  } finally {
    await h.close();
  }
});

test("a caret left in the row beside a marker types into the item", async () => {
  const h = await launchApp({ "Alpha.md": "- bullet\n1. number\n- [ ] task\n" });
  try {
    await h.openNote("Alpha");
    for (const type of ["bullet", "numbered", "checkbox"]) {
      // Put the caret where Chromium leaves it: in the row, before the marker.
      await h.page.locator(`[data-block-type="${type}"]`).evaluate((row) => {
        (row.closest('[contenteditable="true"]') as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(row, 0);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
      });
      expect(await caretAt(h.page)).toContain("(outside its text)");
      await h.page.keyboard.type("A ");
    }

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("A task"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("- A bullet\n1. A number\n- [ ] A task\n");
  } finally {
    await h.close();
  }
});

test("a click between the dot and the text puts the caret in the text", async () => {
  const h = await launchApp({ "Alpha.md": "Intro\n\n- one\n- two\n" });
  try {
    await h.openNote("Alpha");
    // Typing in the note already, as you would be.
    await h.page.locator('[data-block-type="p"]').first().click();
    // The gap between the second dot and its text: Chromium put the caret in
    // the row there, before the dot.
    const box = await h.page.locator("[data-marker]").nth(1).boundingBox();
    if (!box) throw new Error("no bullet marker");
    await h.page.mouse.click(box.x + box.width + 4, box.y + box.height / 2);
    await expect.poll(() => caretAt(h.page)).toBe("bullet:two");
    await h.page.keyboard.type("A ");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("A two"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Intro\n\n- one\n- A two\n");
  } finally {
    await h.close();
  }
});
