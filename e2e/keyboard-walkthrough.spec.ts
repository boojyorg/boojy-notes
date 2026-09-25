import { test, expect, type Page } from "@playwright/test";

// The accessibility pass's proof (docs/BACKLOG.md, Keyboard-only use): a note
// is created, found, renamed, moved and deleted without the mouse. Every
// step below is a key press; `page.mouse` and `.click()` are not used.

const MOD = process.platform === "darwin" ? "Meta" : "Control";
const TO_SIDEBAR = process.platform === "darwin" ? "Control+Meta+s" : "Control+Alt+s";

const row = (page: Page, name: string) =>
  page.getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });
const title = (page: Page) => page.locator("[data-title]").first();

async function start(page: Page) {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
}

test("create, find, rename, move and delete a note with the keyboard alone", async ({ page }) => {
  await start(page);

  // Create: a folder to move into, then a note with a name and a line.
  await page.keyboard.press(`${MOD}+Shift+n`);
  await expect(page.getByTestId("rename-field")).toBeFocused();
  await page.keyboard.type("Archive");
  await page.keyboard.press("Enter");
  await expect(row(page, "Archive")).toBeVisible();

  await page.keyboard.press(`${MOD}+n`);
  await expect(title(page)).toBeFocused();
  await page.keyboard.type("Groceries");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Milk and eggs");
  await expect(row(page, "Groceries")).toBeVisible();

  // Find: a second note in front, then Search brings Groceries back.
  await page.keyboard.press(`${MOD}+n`);
  await expect(title(page)).toHaveText("");
  await expect(title(page)).toBeFocused();
  await page.keyboard.type("Other");
  await expect(row(page, "Other")).toBeVisible();
  await page.keyboard.press(`${MOD}+p`);
  await page.keyboard.type("eggs");
  await expect(page.getByRole("option").first()).toContainText("Groceries");
  await page.keyboard.press("Enter");
  await expect(title(page)).toHaveText("Groceries");

  // Rename: into the tree, F2, a new name.
  await page.keyboard.press(TO_SIDEBAR);
  await expect(row(page, "Groceries")).toBeFocused();
  await page.keyboard.press("F2");
  await page.keyboard.type("Shopping");
  await page.keyboard.press("Enter");
  await expect(row(page, "Shopping")).toBeFocused();

  // Move: the row's menu, Move to…, the folder.
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu");
  await expect(menu).toBeFocused();
  await page.keyboard.press("m");
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog");
  // Keys go in once the picker's tree holds focus (a key sent sooner is the page's).
  await expect(picker.getByRole("tree", { name: "Destination" })).toBeFocused();
  // The picker names its highlighted row through aria-activedescendant.
  const archiveId = await picker.getByRole("treeitem", { name: /Archive/ }).getAttribute("id");
  const highlighted = () =>
    picker.locator("[aria-activedescendant]").getAttribute("aria-activedescendant");
  for (let i = 0; i < 5 && (await highlighted()) !== archiveId; i++) {
    await page.keyboard.press("ArrowDown");
  }
  expect(await highlighted()).toBe(archiveId);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" }).first()).toBeVisible();

  // Delete: back in the tree, ⌘⌫, confirm with the keyboard.
  await page.keyboard.press(TO_SIDEBAR);
  await expect(row(page, "Shopping")).toBeFocused();
  await page.keyboard.press(`${MOD}+Backspace`);
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row(page, "Shopping")).toHaveCount(0);
});

test("Tab leaves a paragraph and Shift+Tab goes back to the name; a list keeps Tab", async ({
  page,
}) => {
  await start(page);
  await title(page).focus();
  await page.keyboard.type("Tabs");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A line");
  await expect(page.locator("[data-editor]")).toHaveText("A line");
  await page.keyboard.press("Shift+Tab");
  await expect(title(page)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  const inEditor = await page.evaluate(() =>
    Boolean(document.activeElement?.closest("[data-editor]")),
  );
  expect(inEditor).toBe(false);
  // Not the skip link at the page's head: that is for arriving, not leaving.
  await expect(page.getByRole("link", { name: "Skip to content" })).not.toBeFocused();
  // The paragraph is untouched: Tab typed nothing.
  await expect(page.locator("[data-editor]")).toHaveText("A line");

  // In a list Tab still indents, and the caret stays in the note.
  await page.keyboard.press(`${MOD}+n`);
  await expect(title(page)).toHaveText("");
  await expect(title(page)).toBeFocused();
  await page.keyboard.type("List");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Tab");
  const stillIn = await page.evaluate(() =>
    Boolean(document.activeElement?.closest("[data-editor]")),
  );
  expect(stillIn).toBe(true);
});

test("Cmd+Shift+Up/Down and Option+Shift+Cmd+Left/Right in a cell move its row and column", async ({
  page,
}) => {
  await start(page);
  await title(page).focus();
  await page.keyboard.type("Grid");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  const cells = page.locator("[data-editor] table th, [data-editor] table td");
  await expect(cells.first()).toBeFocused();
  // Header a | b, one row c | d (Tab walks the cells).
  for (const text of ["a", "b", "c", "d"]) {
    await page.keyboard.type(text);
    await page.keyboard.press("Tab");
  }
  const grid = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-editor] table tr")].map((tr) =>
        [...tr.querySelectorAll("th, td")].map((c) => c.textContent?.trim()),
      ),
    );
  // Tab from the last cell added a row; start from "c".
  await cells.filter({ hasText: /^c$/ }).focus();
  await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
  expect((await grid()).slice(0, 2)).toEqual([
    ["c", "d"],
    ["a", "b"],
  ]);
  await expect(cells.filter({ hasText: /^c$/ })).toBeFocused();
  await page.keyboard.press(`Alt+${MOD}+Shift+ArrowRight`);
  expect((await grid()).slice(0, 2)).toEqual([
    ["d", "c"],
    ["b", "a"],
  ]);
  await expect(cells.filter({ hasText: /^c$/ })).toBeFocused();
  // At an edge nothing moves.
  await page.keyboard.press(`Alt+${MOD}+Shift+ArrowRight`);
  expect((await grid())[0]).toEqual(["d", "c"]);
  // Cmd+Shift+Left stays the text's own (select to the line's start).
  await page.keyboard.press(`${MOD}+Shift+ArrowLeft`);
  expect((await grid())[0]).toEqual(["d", "c"]);
});
