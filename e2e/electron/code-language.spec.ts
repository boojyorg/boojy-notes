/**
 * A code block's language is chosen from the app's own menu, opened by the
 * label at the block's bottom-right corner or by the block's ··· (2026-09-19,
 * replacing a bespoke dropdown and a second copy of the list in a hover
 * submenu). It is the Sort menu's grammar: radio rows, a check on the chosen
 * one, arrows and Enter and Escape, and a letter jumps to a language.
 *
 * Needs the real app: the menu portals to `body` out of the editor's
 * contentEditable, and its keys have to be claimed before the editor's own —
 * a portal leaves the DOM but not the React tree, so Enter reached the editor
 * first and opened a new block instead of choosing.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Code.md";
const FILE = "Intro.\n\n```\nconst a = 1;\n```\n";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: FILE });
  await h.openNote("Code");
});

test.afterEach(async () => {
  await h?.close();
});

const label = (page: AppHandle["page"]) => page.getByRole("button", { name: "Code language" });
const menu = (page: AppHandle["page"]) => page.getByRole("menu", { name: "Code language" });

test("the label opens the menu, Plain first then alphabetical, with the block's own language checked", async () => {
  await expect(label(h.page)).toHaveText(/Plain/);
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  expect(await menu(h.page).getByRole("menuitemradio").allInnerTexts()).toEqual([
    "Plain",
    "Bash",
    "CSS",
    "HTML",
    "JavaScript",
    "JSON",
    "Python",
    "SQL",
    "TypeScript",
  ]);
  const checked = menu(h.page).locator('[role="menuitemradio"][aria-checked="true"]');
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveText("Plain");
  expect(h.pageErrors).toEqual([]);
});

test("a letter jumps to a language and Enter writes its fence word to disk", async () => {
  const blocksBefore = await h.page.locator("[data-block-type]").count();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  // The menu holds focus, so the letter never reaches the code field under it.
  await h.page.keyboard.press("t");
  await expect(menu(h.page)).toHaveAttribute("aria-activedescendant", "code-lang-item-8");
  await h.page.keyboard.press("Enter");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/TypeScript/);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("```typescript"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n```typescript\nconst a = 1;\n```\n");
  // The Enter that chose it never reached the editor, which would have opened
  // a block of its own: the note holds exactly the blocks it did.
  expect(await h.page.locator("[data-block-type]").count()).toBe(blocksBefore);
  expect(h.pageErrors).toEqual([]);
});

test("Escape closes it and changes nothing", async () => {
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("Escape");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/Plain/);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(FILE);
  expect(h.pageErrors).toEqual([]);
});

test("the block's ··· menu opens the same menu, and carries no list of its own", async () => {
  await h.page.locator(".code-block").click({ button: "right" });
  const items = h.page.locator(".code-ctx-item");
  expect(await items.allInnerTexts()).toEqual(["Copy code", "Change language", "Delete block"]);
  await items.filter({ hasText: "Change language" }).click();
  await expect(menu(h.page)).toBeVisible();
  await expect(h.page.locator(".code-ctx-menu")).toHaveCount(0);
  await menu(h.page).getByRole("menuitemradio", { name: "Python" }).click();
  await expect(label(h.page)).toHaveText(/Python/);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("```python"));
  expect(h.pageErrors).toEqual([]);
});

// The press lands on the menu's backdrop, as every menu's does: it closes the
// menu and goes no further, so the caret stays where it was.
test("a press outside closes it", async () => {
  const para = await h.page.locator("[data-block-type='p']").first().boundingBox();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  await h.page.mouse.click(para!.x + 10, para!.y + para!.height / 2);
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/Plain/);
  expect(h.pageErrors).toEqual([]);
});
