import { expect, test } from "@playwright/test";

// The placeholder is a CSS pseudo-element on the heading, read from its
// data-placeholder attribute, so it is judged through computed style: it is
// not in the DOM and can never reach the file or the clipboard.
const placeholderOf = (page: import("@playwright/test").Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const content = getComputedStyle(el, "::before").content;
    return content === "none" ? "" : content.replace(/^"|"$/g, "");
  }, selector);

test("an empty heading names its level until the first character, and again after Backspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Heading placeholder");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();

  // Typed marker.
  await page.keyboard.type("# ");
  const h1 = '[data-editor] h1[data-block-type="h1"]';
  await expect(page.locator(h1)).toHaveCount(1);
  expect(await placeholderOf(page, h1)).toBe("Heading 1");
  await page.keyboard.type("T");
  expect(await placeholderOf(page, h1)).toBe("");
  await page.keyboard.press("Backspace");
  expect(await placeholderOf(page, h1)).toBe("Heading 1");
  expect(await page.locator(h1).textContent()).toBe("");

  // Slash menu.
  await page.keyboard.type("Title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/heading 3");
  await page.keyboard.press("Enter");
  const h3 = '[data-editor] h3[data-block-type="h3"]';
  await expect(page.locator(h3)).toHaveCount(1);
  expect(await placeholderOf(page, h3)).toBe("Heading 3");
  await page.keyboard.type("Sub");
  expect(await placeholderOf(page, h3)).toBe("");

  // A paragraph keeps its own placeholder rule: only the note's first block.
  await page.keyboard.press("Enter");
  expect(await placeholderOf(page, '[data-editor] p[data-block-type="p"]')).toBe("");
});
