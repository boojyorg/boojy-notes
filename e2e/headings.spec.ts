import { expect, test } from "@playwright/test";

test("search-only H4–H6 remain headings after a browser reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Heading browser check");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  const menu = page.getByRole("menu", { name: "Slash commands" });
  for (const level of [4, 5, 6]) {
    await page.keyboard.type("/");
    await expect(menu.getByRole("menuitem")).toHaveCount(11);
    await expect(menu.getByRole("menuitem").filter({ hasText: `Heading ${level}` })).toHaveCount(0);
    await page.keyboard.type(`heading ${level}`);
    await expect(menu.getByRole("menuitem")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Browser level ${level}`);
    await expect(page.locator(`h${level}[data-block-type]`)).toHaveText(`Browser level ${level}`);
    await page.keyboard.press("Enter");
  }
  // Switching notes commits through the same UI path used during ordinary use.
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.reload();
  await page.getByRole("treeitem").filter({ hasText: "Heading browser check" }).click();
  for (const level of [4, 5, 6]) {
    await expect(page.locator(`h${level}[data-block-type]`)).toHaveText(`Browser level ${level}`);
  }
});
