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
  // The callout's title follows the new type's default.
  await expect(page.locator("[data-editor]")).toContainText(chosen);

  await trigger.click();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
});
