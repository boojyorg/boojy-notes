/**
 * The `\` menu in a formula's source, in a `$$` block and in a sentence: the
 * `\word` the caret ends is completed to a command, the caret inside its first
 * `{}`, as an undo entry of its own (Cmd+Z gives back the `\word`, then the
 * typing before it). The file holds the LaTeX alone.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Latex.md";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const source = (page: AppHandle["page"]) => page.getByRole("textbox", { name: "Formula source" });
const menu = (page: AppHandle["page"]) => page.getByRole("listbox", { name: "LaTeX commands" });

test("in a $$ block: \\fr and Enter writes \\frac{}{} with the caret in the numerator", async () => {
  h = await launchApp({ [NOTE]: "$$\nx\n$$\n" });
  await h.openNote("Latex");
  await h.page.getByRole("button", { name: "Edit formula" }).click();
  await h.page.keyboard.type(" = \\fr");
  await expect(menu(h.page).getByRole("option").first()).toContainText("\\frac");
  await h.page.keyboard.press("Enter");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(source(h.page)).toHaveValue("x = \\frac{}{}");
  await h.page.keyboard.type("1");
  await h.page.keyboard.press("ArrowRight");
  await h.page.keyboard.press("ArrowRight");
  await h.page.keyboard.type("n");
  await h.page.keyboard.press("Escape");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("{n}"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("$$\nx = \\frac{1}{n}\n$$\n");
  expect(h.pageErrors).toEqual([]);
});

test("in a $$ block: Cmd+Z takes the command back to \\fr, then the typing before it", async () => {
  h = await launchApp({ [NOTE]: "$$\nx\n$$\n" });
  await h.openNote("Latex");
  await h.page.getByRole("button", { name: "Edit formula" }).click();
  // Typed and chosen inside one typing burst: the choice is still its own step.
  await h.page.keyboard.type("+\\fr");
  await h.page.keyboard.press("Enter");
  await expect(source(h.page)).toHaveValue("x+\\frac{}{}");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("x+\\fr");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("x");
  await h.page.keyboard.press("Escape");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("$$\nx\n$$\n");
  expect(h.pageErrors).toEqual([]);
});

test("in a sentence: \\less and Tab writes \\le into the formula; Cmd+Z gives back \\less", async () => {
  h = await launchApp({ [NOTE]: "So $a$ here.\n" });
  await h.openNote("Latex");
  await h.page.locator(".inline-math").click();
  await expect(source(h.page)).toBeFocused();
  await h.page.keyboard.type(" \\less");
  await expect(menu(h.page).getByRole("option").first()).toContainText("\\le");
  await h.page.keyboard.press("Tab");
  await expect(source(h.page)).toHaveValue("a \\le");
  await expect(source(h.page)).toBeFocused();
  await h.page.keyboard.type(" b");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("So $a \\le b$ here.\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("a \\le");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("a \\less");
  await h.page.keyboard.press("Escape");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("So $a \\less$ here.\n");
  expect(h.pageErrors).toEqual([]);
});

test("Escape closes only the menu; \\\\ and a caret mid-word offer nothing", async () => {
  h = await launchApp({ [NOTE]: "$$\nx\n$$\n" });
  await h.openNote("Latex");
  await h.page.getByRole("button", { name: "Edit formula" }).click();
  await h.page.keyboard.type("\\al");
  await expect(menu(h.page)).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(source(h.page)).toBeFocused();
  await h.page.keyboard.type(" \\\\");
  await expect(menu(h.page)).toHaveCount(0);
  await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.press("ArrowLeft");
  await expect(menu(h.page)).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

test("in a short window the menu stays on screen: it shrinks to the room it has and scrolls", async () => {
  h = await launchApp({ [NOTE]: "$$\nx\n$$\n" });
  await h.openNote("Latex");
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(900, 400);
  });
  await expect.poll(() => h.page.evaluate(() => window.innerHeight)).toBeLessThan(420);
  await h.page.getByRole("button", { name: "Edit formula" }).click();
  await h.page.keyboard.type("\\");
  await expect(menu(h.page)).toBeVisible();
  const box = await menu(h.page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: window.innerHeight };
  });
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.height);
  // Every row is still reachable: the last one scrolls into view on the arrows.
  for (let i = 0; i < 7; i++) await h.page.keyboard.press("ArrowDown");
  await expect(menu(h.page).getByRole("option").last()).toBeInViewport();
  expect(h.pageErrors).toEqual([]);
});
