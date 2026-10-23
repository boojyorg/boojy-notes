/**
 * `$x$` in a sentence is one sealed formula: drawn by KaTeX, one character to
 * the caret, its source on the element and in the file. The closing `$`
 * typed converts it (the Pandoc-style rule, so money stays text); a click
 * opens its source under it; Backspace takes it whole and Cmd+Z brings it back.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  START_OF_LINE,
  launchApp,
  menuClick,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Inline.md";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const para = (page: AppHandle["page"], text: string) =>
  page.locator("[data-block-type='p']", { hasText: text });
const atoms = (page: AppHandle["page"]) => page.locator("[data-block-type='p'] .inline-math");
const source = (page: AppHandle["page"]) => page.getByRole("textbox", { name: "Formula source" });

test("the closing $ draws the formula, money stays text, and typing after it is prose", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n" });
  await h.openNote("Inline");
  await para(h.page, "Intro.").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" costs $5 and $10, mean $\\bar{x}$ ok");
  await expect(atoms(h.page)).toHaveCount(1);
  await expect(atoms(h.page).locator(".katex")).toBeVisible();
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("ok"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro. costs $5 and $10, mean $\\bar{x}$ ok\n");
  expect(h.pageErrors).toEqual([]);
});

test("a click opens the source under it; Shift+Enter leaves the caret after it", async () => {
  h = await launchApp({ [NOTE]: "Mean $x$ here.\n" });
  await h.openNote("Inline");
  await atoms(h.page).click();
  await expect(source(h.page)).toBeFocused();
  await expect(source(h.page)).toHaveValue("x");
  await h.page.keyboard.type("^2");
  await expect(atoms(h.page).locator(".katex annotation")).toHaveText("x^2");
  await h.page.keyboard.press("Shift+Enter");
  await expect(source(h.page)).toHaveCount(0);
  await h.page.keyboard.type("!");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("!"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Mean $x^2$! here.\n");
  expect(h.pageErrors).toEqual([]);
});

test("the arrows cross it as one character, Backspace takes it whole, Cmd+Z brings it back", async () => {
  h = await launchApp({ [NOTE]: "ab $x$ cd\n" });
  await h.openNote("Inline");
  await para(h.page, "cd").click();
  await h.page.keyboard.press(END_OF_LINE);
  // ← three times: d, c, the space; a fourth crosses the formula whole.
  for (let i = 0; i < 4; i++) await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.type("|");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("ab |$x$ cd\n");
  await h.page.keyboard.press("ArrowRight");
  await h.page.keyboard.press("Backspace");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("ab | cd\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(atoms(h.page)).toHaveCount(1);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("ab |$x$ cd\n");
  expect(h.pageErrors).toEqual([]);
});

test("a formula at the end and the start of a line takes typing on both sides", async () => {
  h = await launchApp({ [NOTE]: "$a$ mid $b$\n" });
  await h.openNote("Inline");
  await para(h.page, "mid").click({ position: { x: 60, y: 5 } });
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type("Z");
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.type("A");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("A$a$ mid $b$Z\n");
  expect(h.pageErrors).toEqual([]);
});

test("Escape closes the source unchanged, and Cmd+Z in it undoes the note's typing", async () => {
  h = await launchApp({ [NOTE]: "See $y$.\n" });
  await h.openNote("Inline");
  await atoms(h.page).click();
  await h.page.keyboard.type("+1");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("See $y+1$.\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("y");
  await h.page.keyboard.press("Escape");
  await expect(source(h.page)).toHaveCount(0);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("See $y$.\n");
  expect(h.pageErrors).toEqual([]);
});

test("a formula in a table cell commits through the cell", async () => {
  h = await launchApp({ [NOTE]: "| a | b |\n| --- | --- |\n| $x$ | c |\n" });
  await h.openNote("Inline");
  await h.page.locator(".inline-math").click();
  await expect(source(h.page)).toBeFocused();
  await h.page.keyboard.type("^2");
  await h.page.keyboard.press("Escape");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("x^2"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("| a | b |\n| --- | --- |\n| $x^2$ | c |\n");
  expect(h.pageErrors).toEqual([]);
});

test("a formula in a callout's body commits through the body, the title untouched", async () => {
  h = await launchApp({ [NOTE]: "> [!note] Title\n> body $x$ end\n" });
  await h.openNote("Inline");
  await h.page.locator(".inline-math").click();
  await h.page.keyboard.type("+1");
  await h.page.keyboard.press("Escape");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("x+1"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("> [!note] Title\n> body $x+1$ end\n");
  expect(h.pageErrors).toEqual([]);
});

test("Find and Replace leave a formula's drawing alone; its source is the formula's", async () => {
  h = await launchApp({ [NOTE]: "Solve $x$ for x.\n" });
  await h.openNote("Inline");
  await expect(atoms(h.page).locator(".katex")).toBeVisible();
  await para(h.page, "for").click();
  await menuClick(h, "replace");
  await h.page.getByPlaceholder("Find in note...").fill("x");
  await expect(h.page.getByText("1 of 1")).toBeVisible();
  await h.page.getByPlaceholder("Replace with...").fill("y");
  await h.page.getByRole("button", { name: "Replace", exact: true }).click();
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Solve $x$ for y.\n");
  await expect(atoms(h.page).locator(".katex annotation")).toHaveText("x");
  expect(h.pageErrors).toEqual([]);
});
