import { expect, type Page, test } from "@playwright/test";

// A drag from past a bullet's end back over its dot ends the selection beside
// the dot, outside the item's text. Backspace emptied the text on screen, but
// the file kept the words, and the next Backspace merged them into the
// heading above ("Bugshave bug…", 2026-09-27). The selection's ends now go
// into the text when the drag ends, so the edit is the text's.

const source = async (page: Page) => {
  await page.keyboard.press("Meta+/");
  const text = await page.locator("textarea").inputValue();
  await page.keyboard.press("Meta+/");
  return text;
};

test("a drag back over a bullet's dot, then Backspace twice, empties the item and never merges it upward", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Bugs note");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("## Bugs");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- have bug. when i delete all of text");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second item stays");

  const text = page.locator('[data-editor] [data-block-type="bullet"] [role="textbox"]').first();
  const b = (await text.boundingBox())!;
  await page.mouse.move(b.x + b.width + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 30, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString()))
    .toBe("have bug. when i delete all of text");

  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(page.locator('[data-editor] [data-block-type="h2"]')).toHaveText("Bugs");
  await expect.poll(() => source(page)).toBe("## Bugs\n\n\n- second item stays");
});
