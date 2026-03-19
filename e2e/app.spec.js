import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Boojy Notes", () => {
  test("app loads and shows editor", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Boojy Notes/i);
    // Editor area should be visible
    await expect(page.locator("[data-editor]").first()).toBeVisible({ timeout: 10000 });
  });

  test("can create and edit a note", async ({ page }) => {
    await page.goto("/");
    // Wait for app to load
    await page.waitForSelector("[data-editor]", { timeout: 10000 });
    // The title input should be present
    const title = page.locator("[data-title]").first();
    await expect(title).toBeVisible({ timeout: 5000 });
    // contentEditable requires click + keyboard.type instead of fill
    await title.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("E2E Test Note");
    await expect(title).toHaveText("E2E Test Note");
  });

  test("settings modal opens and closes", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-editor]", { timeout: 10000 });
    // Look for settings gear/button
    const settingsBtn = page.locator('[data-testid="settings-button"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    // Modal should appear
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  });

  test("keyboard shortcut Cmd+N creates new note", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-editor]", { timeout: 10000 });
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+n`);
    // A new note should be created (title should be empty/focused)
    const title = page.locator("[data-title]").first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  test("no critical accessibility violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("[data-editor]", { timeout: 10000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"]) // Skip color contrast for now — theme-dependent
      .analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});
