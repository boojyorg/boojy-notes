/**
 * A space typed where Chromium holds it as U+00A0 (the line's end, a second
 * space, just after a link) reaches the file as a space. The read-back is
 * verbatim, so a save in the pause after a trailing space wrote the
 * non-breaking byte, and one after a link stayed so (Obsidian kept it). A
 * U+00A0 the file itself holds is its own byte, kept through an edit.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NBSP = " ";

test("a space typed at a line's end, twice in a row or after a link is a plain space in the file", async () => {
  const h = await launchApp({ "Note.md": "Hello\n\nSee [[Other]]\n", "Other.md": "x\n" });
  try {
    await h.openNote("Note");
    const blocks = h.page.locator("[data-editor] [data-block-id]");

    await blocks.nth(0).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" ");
    await waitForFile(h.vault.file("Note.md"), (t) => t.startsWith("Hello "));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Note.md")).not.toContain(NBSP);

    await h.page.keyboard.type(" world");
    await blocks.nth(1).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" now");
    await waitForFile(h.vault.file("Note.md"), (t) => t.includes("now"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Note.md")).toBe("Hello  world\n\nSee [[Other]] now\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a non-breaking space the file holds is kept through an edit of its line", async () => {
  const h = await launchApp({ "Note.md": `10${NBSP}km away\n` });
  try {
    await h.openNote("Note");
    await h.page.locator("[data-editor] [data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" today");
    await waitForFile(h.vault.file("Note.md"), (t) => t.includes("today"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Note.md")).toBe(`10${NBSP}km away today\n`);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// A field of its own repaints when it does not hold the ref's latest text
// (useOwnedField); the field's U+00A0 against the settled space was such a
// difference, so a pause after a trailing space repainted the field, the space
// collapsed, and the next word joined the last ("Headsup").
test("a pause after a space in a callout title, its body or a table cell keeps the space", async () => {
  const h = await launchApp({
    "Note.md": "> [!note] Heads\n> Body\n\n| A | B |\n| --- | --- |\n| c | d |\n",
  });
  try {
    await h.openNote("Note");
    const fields = [
      h.page.locator(".callout-title"),
      h.page.locator(".callout-body"),
      h.page.locator("table.table-block td").first(),
    ];
    for (const field of fields) {
      await field.click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.type(" ");
      await sleep(800); // past the text commit's debounce and its render
      await h.page.keyboard.type("up");
    }
    await waitForFile(h.vault.file("Note.md"), (t) => (t.match(/ up/g) || []).length === 3);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Note.md")).toBe(
      "> [!note] Heads up\n> Body up\n\n| A | B |\n| --- | --- |\n| c up | d |\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
