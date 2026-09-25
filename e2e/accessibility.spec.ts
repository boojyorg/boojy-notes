import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// axe over the surfaces a keyboard or screen-reader user meets first, in both
// themes, contrast included. Serious and critical fail; moderate and minor are
// advice. The palette's contrast is also proved token by token in
// tests/constants/themeContrast.test.js; this catches what a component does
// with the tokens (an alpha, an inherited colour).

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function open(page: Page, themeMode: "day" | "night") {
  await page.addInitScript((mode) => {
    localStorage.setItem("boojy-theme", JSON.stringify({ themeMode: mode }));
  }, themeMode);
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
}

async function writeNote(page: Page) {
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Reading list");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A paragraph with a #tag in it.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## A heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- a list item");
  await expect(page.getByRole("treeitem", { name: /Reading list/ })).toBeVisible();
}

async function expectNoSeriousViolations(page: Page) {
  // The theme fades for 400 ms; judge the settled colours.
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) }));
  expect(serious).toEqual([]);
}

for (const themeMode of ["day", "night"] as const) {
  const label = themeMode === "day" ? "Light" : "Dark";

  test.describe(`accessibility, ${label}`, () => {
    test("the app on first open", async ({ page }) => {
      await open(page, themeMode);
      await expectNoSeriousViolations(page);
    });

    test("a note with text", async ({ page }) => {
      await open(page, themeMode);
      await writeNote(page);
      await expectNoSeriousViolations(page);
    });

    test("a note's menu", async ({ page }) => {
      await open(page, themeMode);
      await writeNote(page);
      await page.getByRole("treeitem", { name: /Reading list/ }).click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("the slash menu", async ({ page }) => {
      await open(page, themeMode);
      await page.locator("[data-editor] [data-block-id]").first().click();
      await page.keyboard.type("/");
      await expect(page.getByRole("listbox", { name: "Slash commands" })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("Settings", async ({ page }) => {
      await open(page, themeMode);
      await page.getByTestId("wordmark-settings-button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test("Search", async ({ page }) => {
      await open(page, themeMode);
      await writeNote(page);
      await page.keyboard.press(`${MOD}+p`);
      await page.keyboard.type("read");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
}
