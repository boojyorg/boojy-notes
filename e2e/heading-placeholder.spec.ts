import { expect, test, type Page } from "@playwright/test";

// The placeholder is a CSS pseudo-element on the heading, read from its
// data-placeholder attribute, so it is judged through computed style: it is
// not in the DOM and can never reach the file or the clipboard.
const placeholderOf = (page: Page, selector: string) =>
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

// An emptied field holds a `<br>`, and so does one with a soft break, so the
// placeholder reads the live text (`data-empty`), never the elements.
test("an empty callout title or body shows its placeholder, and again once cleared", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-editor] [data-block-id]").first().click();
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  const body = "[data-editor] .callout-body";
  const title = "[data-editor] .callout-title";
  await expect(page.locator(body)).toHaveCount(1);
  expect(await placeholderOf(page, body)).toBe("Type callout content...");

  await page.locator(body).click();
  await page.keyboard.type("Hi");
  expect(await page.locator(body).textContent()).toBe("Hi");
  expect(await placeholderOf(page, body)).toBe("");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Backspace");
  // `Hi<br>`: one <br>, but text, so no placeholder over it.
  expect(await placeholderOf(page, body)).toBe("");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  expect(await page.locator(body).textContent()).toBe("");
  expect(await placeholderOf(page, body)).toBe("Type callout content...");

  await page.locator(title).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  expect(await page.locator(title).textContent()).toBe("");
  expect(await placeholderOf(page, title)).toBe("Note");
});
