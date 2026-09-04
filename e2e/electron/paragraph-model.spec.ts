/**
 * Blocks are Markdown structure, not source lines. Enter starts a new
 * paragraph, written with a blank line between; Shift+Enter is a soft break
 * inside the paragraph, written as adjacent lines; a two-line paragraph from
 * another app opens as one block with a visible break; a plain line under a
 * list item belongs to the item; and editing one block leaves every other
 * byte of the file as it was. All of it survives a restart.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  editorText,
  expectNoTempFiles,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

/** Non-empty editor blocks, each as the text the user reads. */
const blockShapes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]"))
      // A list row prints its marker glyph on a line of its own; the text is what follows.
      .map((b) =>
        (b as HTMLElement).innerText
          .replace(/\n$/, "")
          .replace(/\u200B/g, "")
          .replace(/^[●◦▪]\n/, "")
          .replace(/^\d+\.\n/, ""),
      )
      .filter((t) => t.trim() !== ""),
  );

test("Enter writes a blank line between paragraphs; Shift+Enter keeps lines in one paragraph", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha." });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("Paragraph two");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Paragraph two"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nParagraph two");

    await h.page.keyboard.press("Shift+Enter");
    await h.page.keyboard.type("same paragraph");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("same paragraph"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nParagraph two\nsame paragraph");
    expect(await blockShapes(h.page)).toEqual(["Alpha.", "Paragraph two\nsame paragraph"]);

    await h.restart();
    expect(await blockShapes(h.page)).toEqual(["Alpha.", "Paragraph two\nsame paragraph"]);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nParagraph two\nsame paragraph");
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an Obsidian-style note opens as its structure, and an edit leaves the rest of the file alone", async () => {
  const source = [
    "# Notes",
    "Line one",
    "line two of the same paragraph.",
    "",
    "",
    "- item one",
    "continuation under item one",
    "- item two",
    "",
    "- loose item",
    "",
    "> quoted",
    "lazy quote line",
    "",
    "Hard break here  ",
    "after the break.",
    "",
    "Edit me.",
    "",
  ].join("\n");
  const h = await launchApp({ "Obsidian.md": source });
  try {
    await h.openNote("Obsidian");
    expect(await blockShapes(h.page)).toEqual([
      "Notes",
      "Line one\nline two of the same paragraph.",
      "item one\ncontinuation under item one",
      "item two",
      "loose item",
      "quoted",
      "lazy quote line",
      "Hard break here\nafter the break.",
      "Edit me.",
    ]);

    // Editing the last paragraph changes only its bytes.
    await h.page.locator("[data-block-id]").filter({ hasText: "Edit me." }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited.");
    await waitForFile(h.vault.file("Obsidian.md"), (t) => t.includes("Edited."));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Obsidian.md")).toBe(source.replace("Edit me.", "Edit me. Edited."));

    await h.restart();
    expect((await editorText(h.page)).startsWith("Notes\nLine one\nline two")).toBe(true);
    expect(h.vault.read("Obsidian.md")).toBe(source.replace("Edit me.", "Edit me. Edited."));
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
