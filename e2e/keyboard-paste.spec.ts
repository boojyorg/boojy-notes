import { expect, test } from "@playwright/test";

/**
 * A phone keyboard's clipboard (Gboard's) pastes by typing: the lines arrive
 * as one `insertText`, never as a paste event, so Notion's `# Heading` stayed
 * text. Several lines typed at once are a paste, read as Markdown.
 */
test("several lines a keyboard types at once are pasted as Markdown", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Keyboard paste");
  const block = page.locator('[data-editor] [data-block-type="p"]').first();
  await block.click();
  await page.locator("[data-editor]").evaluate((editor) => {
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "# Demo\n\n## Part two\n\nSome **bold** text.\n\n- one\n- two",
      bubbles: true,
      cancelable: true,
    });
    editor.querySelector('[data-block-type="p"]')?.dispatchEvent(event);
  });
  await expect(page.locator("h1[data-block-type]")).toHaveText("Demo");
  await expect(page.locator("h2[data-block-type]")).toHaveText("Part two");
  await expect(page.locator('[data-editor] [data-block-type="p"] strong')).toHaveText("bold");
  await expect(page.locator('[data-editor] [data-block-type="bullet"]')).toHaveCount(2);
  await expect(page.locator("[data-editor]")).not.toContainText("# Demo");
});

test("one word a keyboard types at once is still typing", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Keyboard word");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  const prevented = await page.locator("[data-editor]").evaluate((editor) => {
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "worldwide ",
      bubbles: true,
      cancelable: true,
    });
    editor.querySelector('[data-block-type="p"]')?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});
