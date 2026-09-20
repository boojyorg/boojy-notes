import { expect, test } from "@playwright/test";

// Chromium's triple-click ends its selection at the start of the next block;
// when that block is a list row, the end lands on the row's non-editable
// marker and Chromium collapses the selection. The editor selects the clicked
// block itself, so every row answers a triple-click with its own text.
test("triple-click selects a list row whatever row follows it", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Triple click");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("Opening paragraph");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. Numbered one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Numbered two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[] Task one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Task two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Closing paragraph");

  const selected = () => page.evaluate(() => window.getSelection()?.toString() ?? "");
  const tripleClick = async (type: string, index: number) => {
    const row = page.locator(`[data-editor] [data-block-type="${type}"]`).nth(index);
    // A list row's text root is its last direct child; a paragraph is its own.
    const text = row.locator("> span").last();
    const box = await ((await text.count()) ? text : row).boundingBox();
    if (!box) throw new Error("row not laid out");
    await page.mouse.click(box.x + 20, box.y + 10, { clickCount: 3 });
  };

  // Top to bottom, because the formatting strip that a selection raises sits
  // over the row above it. A paragraph stops at its own end rather than
  // reaching into the next block; a numbered item followed by a numbered item
  // and a task followed by a task are the two rows Chromium left empty.
  await tripleClick("p", 0);
  expect(await selected()).toBe("Opening paragraph");
  await tripleClick("numbered", 0);
  expect(await selected()).toBe("Numbered one");
  await tripleClick("numbered", 1);
  expect(await selected()).toBe("Numbered two");
  await tripleClick("checkbox", 0);
  expect(await selected()).toBe("Task one");
});
