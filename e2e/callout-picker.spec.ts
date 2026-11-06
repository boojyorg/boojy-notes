import { test, expect } from "@playwright/test";

// The callout type picker keeps the caret in the callout and takes only the
// menu keys (useMenuKeys, as a suggestion menu): arrows wrap, Enter chooses,
// Escape closes; the field under it never sees them.

test("the callout picker walks its options by keyboard and chooses with Enter", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-editor] [data-block-id]").first().click();
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  const trigger = page.getByRole("button", { name: "Change callout type" });
  await expect(trigger).toBeVisible();

  await trigger.click();
  const picker = page.getByRole("listbox", { name: "Callout type" });
  await expect(picker).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const options = picker.getByRole("option");
  const count = await options.count();
  await expect(options.first()).toHaveAttribute("aria-selected", "true");

  // Up from the first wraps to the last; down comes back round.
  await page.keyboard.press("ArrowUp");
  await expect(options.nth(count - 1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  const chosen = (await options.nth(1).innerText()).trim();

  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  // An empty title stays empty (nothing is written to the file): it is shown
  // as the new type's name.
  const title = page.locator(".callout-title").first();
  await expect(title).toHaveText("");
  await expect(title).toHaveAttribute("data-placeholder", chosen);

  await trigger.click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
});

// An empty title is the type's name, and that is the title the reader sees:
// drawn at full strength, faint only while the caret is in it to type over.
test("an empty callout title reads at full strength, faint only while typed into", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-editor] [data-block-id]").first().click();
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  const title = page.locator(".callout-title").first();
  await expect(title).toHaveAttribute("data-placeholder", "Note");
  const opacity = () => title.evaluate((el) => Number(getComputedStyle(el, "::before").opacity));
  // A new callout starts with the caret in its title, so faint there.
  await expect.poll(opacity).toBeLessThan(0.5);
  // In the body, the title is at rest: the name at full strength.
  await page.locator(".callout-body").first().click();
  await expect.poll(opacity).toBe(1);
  await title.click();
  await expect.poll(opacity).toBeLessThan(0.5);
});
