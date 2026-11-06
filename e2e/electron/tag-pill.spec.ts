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

// A click on a tag searches it; its right-click menu offers Search and Edit
// tag. Edit tag selects the name (the `#` left out), so typing renames only
// this occurrence and it stays a tag.
test("a tag's right-click menu searches it or edits this one; a click still searches", async () => {
  const h = await launchApp({ "Note.md": "see #area/work and #area/work again\n" });
  try {
    const page = h.page;
    await h.openNote("Note");
    const pills = page.locator("[data-editor] .inline-tag");
    await expect(pills).toHaveText(["#area/work", "#area/work"]);

    await pills.first().click();
    const palette = page.getByRole("dialog", { name: /search/i });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);

    await pills.first().click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Search #area/work" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Search #area/work" }).click();
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");

    await pills.first().click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Edit tag" }).click();
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("area/work");
    await page.keyboard.type("area/home");
    await expect(pills).toHaveText(["#area/home", "#area/work"]);
    await waitForFile(
      h.vault.file("Note.md"),
      (t) => t === "see #area/home and #area/work again\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// A right-click on a tag selects it whole, `#` and nested parts, as a Mac
// selects a right-clicked word: Cut and Copy take all of it.
test("a right-click selects the whole tag, so Cut takes all of it and Paste puts it back", async () => {
  const h = await launchApp({ "Note.md": "see #area/work and more\n" });
  try {
    const page = h.page;
    await h.openNote("Note");
    const pill = page.locator("[data-editor] .inline-tag");
    const box = (await pill.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2, { button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("#area/work");
    await expect(menu.getByRole("menuitem", { name: /^Cut/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await menu.getByRole("menuitem", { name: /^Cut/ }).click();
    await waitForFile(h.vault.file("Note.md"), (t) => t === "see  and more\n");

    await page.locator("[data-editor] [data-block-id]").first().click();
    await page.keyboard.press(END_OF_LINE);
    await page.keyboard.type(" ");
    const block = (await page.locator("[data-editor] [data-block-id]").first().boundingBox())!;
    await page.mouse.click(block.x + block.width - 4, block.y + block.height / 2, {
      button: "right",
    });
    await menu.getByRole("menuitem", { name: /^Paste/ }).click();
    // The file only: a pasted tag is drawn as a pill at the next repaint
    // (a known gap of every paste, apart from this menu).
    await waitForFile(h.vault.file("Note.md"), (t) => t === "see  and more #area/work\n");
  } finally {
    await h.close();
  }
});
