import { expect, test } from "@playwright/test";

/**
 * A phone keyboard's clipboard (Gboard's) pastes by typing: the lines arrive
 * as one `insertText`, never as a paste event, so Notion's `# Heading` stayed
 * text. Several lines typed at once are a paste, read as Markdown. The input
 * is the browser's own (`insertText`), addressed to the editor as a whole, as
 * a keyboard's is.
 */
async function openBlankNote(page, title: string) {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type(title);
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
}

test("several lines a keyboard types at once are pasted as Markdown", async ({ page }) => {
  await openBlankNote(page, "Keyboard paste");
  await page.keyboard.insertText("# Demo\n\n## Part two\n\nSome **bold** text.\n\n- one\n- two");
  await expect(page.locator("h1[data-block-type]")).toHaveText("Demo");
  await expect(page.locator("h2[data-block-type]")).toHaveText("Part two");
  await expect(page.locator('[data-editor] [data-block-type="p"] strong')).toHaveText("bold");
  await expect(page.locator('[data-editor] [data-block-type="bullet"]')).toHaveCount(2);
  await expect(page.locator("[data-editor]")).not.toContainText("# Demo");
});

test("one word a keyboard types at once is still typing", async ({ page }) => {
  await openBlankNote(page, "Keyboard word");
  await page.keyboard.insertText("worldwide ");
  await expect(page.locator('[data-editor] [data-block-type="p"]').first()).toHaveText(
    /^worldwide\s$/,
  );
});

test("several lines typed into a code block are the code block's", async ({ page }) => {
  await openBlankNote(page, "Keyboard code");
  await page.keyboard.type("``` ");
  const code = page.locator("textarea.code-textarea");
  await expect(code).toBeFocused();
  await page.keyboard.insertText("# not a heading\nline two");
  await expect(code).toHaveValue("# not a heading\nline two");
  await expect(page.locator("h1[data-block-type]")).toHaveCount(0);
});
