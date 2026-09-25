import { test, expect, type Page } from "@playwright/test";

// The sidebar tree from the keyboard (WAI-ARIA tree pattern): one Tab stop,
// arrows between the rows that show, Right/Left open and close, F2 renames,
// ⌘⌫ deletes, Shift+F10 opens the row's menu, Escape goes back to the note,
// ⌃⌘S comes to the tree from anywhere. `.claude/rules/ui-chrome-and-theme.md`.

const MOD = process.platform === "darwin" ? "Meta" : "Control";
const TO_SIDEBAR = process.platform === "darwin" ? "Control+Meta+s" : "Control+Alt+s";

const row = (page: Page, name: string) =>
  page.getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });
const focusedKey = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement)?.dataset?.treeKey ?? null);

async function newNote(page: Page, title: string) {
  await page.keyboard.press(`${MOD}+n`);
  await page.keyboard.type(title);
  await expect(row(page, title)).toBeVisible();
}

// Work/ ── Plan ; Alpha ; Beta (root notes)
async function setUp(page: Page) {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Alpha");
  await expect(row(page, "Alpha")).toBeVisible();
  await newNote(page, "Beta");
  await page.keyboard.press(`${MOD}+Shift+n`);
  await page.getByTestId("rename-field").fill("Work");
  await page.keyboard.press("Enter");
  await expect(row(page, "Work")).toBeVisible();
  await page.getByRole("button", { name: "New note in Work", exact: true }).click();
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Plan");
  await expect(row(page, "Plan")).toBeVisible();
}

test("the tree is one Tab stop, with each row's level and place", async ({ page }) => {
  await setUp(page);
  const stops = await page.locator('[role="tree"] [tabindex="0"]').count();
  expect(stops).toBe(1);
  await expect(row(page, "Work")).toHaveAttribute("aria-level", "1");
  await expect(row(page, "Plan")).toHaveAttribute("aria-level", "2");
  await expect(row(page, "Plan")).toHaveAttribute("aria-posinset", "1");
  await expect(row(page, "Plan")).toHaveAttribute("aria-setsize", "1");
  await expect(row(page, "Beta")).toHaveAttribute("aria-setsize", "3");
});

test("arrows walk the rows that show; Right and Left open, enter and leave a folder", async ({
  page,
}) => {
  await setUp(page);
  await row(page, "Plan").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Work")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Work")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Alpha")).toBeFocused();
  await page.keyboard.press("End");
  await expect(row(page, "Beta")).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "Work")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "Plan")).toBeFocused();
  // A letter jumps to the next row that starts with it.
  await page.keyboard.press("b");
  await expect(row(page, "Beta")).toBeFocused();
  // Enter opens the note.
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-title]").first()).toHaveText("Beta");
});

test("F2 renames and gives the row its focus back", async ({ page }) => {
  await setUp(page);
  await row(page, "Alpha").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("Gamma");
  await page.keyboard.press("Enter");
  await expect(row(page, "Gamma")).toBeFocused();
  await row(page, "Work").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("Jobs");
  await page.keyboard.press("Enter");
  await expect(row(page, "Jobs")).toBeFocused();
});

test("⌘⌫ deletes the row after its confirm and focuses the row that took its place", async ({
  page,
}) => {
  await setUp(page);
  await row(page, "Alpha").focus();
  await page.keyboard.press(`${MOD}+Backspace`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row(page, "Alpha")).toHaveCount(0);
  await expect(row(page, "Beta")).toBeFocused();
});

test("Shift+F10 opens the row's menu; Escape closes it back onto the row", async ({ page }) => {
  await setUp(page);
  await row(page, "Beta").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(row(page, "Beta")).toBeFocused();
});

test("Escape goes back to the note; ⌃⌘S comes back, showing a hidden sidebar", async ({ page }) => {
  await setUp(page);
  await page.keyboard.press(TO_SIDEBAR);
  await page.keyboard.press("Escape");
  expect(await focusedKey(page)).toBeNull();
  await page.keyboard.press(`${MOD}+\\`);
  await page.keyboard.press(TO_SIDEBAR);
  // The row last focused (the folder, after its rename in setUp) is the stop.
  await expect(row(page, "Work")).toBeFocused();
});

test("Escape while a row's menu is open closes the menu, however soon", async ({ page }) => {
  await setUp(page);
  // The press focuses the row; Escape lands before the menu takes focus.
  await row(page, "Beta").click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await focusedKey(page)).not.toBeNull();
});
