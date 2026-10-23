/**
 * A `$$` block draws its formula where it sits; a click (or Enter on the
 * selected block) opens the source in a panel underneath, and the drawing
 * follows every keystroke. Enter is a new line; Shift+Enter, Escape, Done or a
 * click away finishes and writes nothing more; ↑/↓ at the field's edges walk
 * out. The file holds the formula as the user spelled it.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Maths.md";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const source = (page: AppHandle["page"]) => page.getByRole("textbox", { name: "Formula source" });
const formula = (page: AppHandle["page"]) => page.locator("[data-block-type='math']");

test("$$ and a space opens a formula whose source draws live and saves as the app's $$ lines", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n" });
  await h.openNote("Maths");
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("$$ ");
  await expect(source(h.page)).toBeFocused();
  await h.page.keyboard.type("x^2");
  // Drawn while the panel is open, from the field, before any commit settles.
  await expect(formula(h.page).locator(".katex annotation")).toHaveText("x^2");
  await h.page.keyboard.press("Shift+Enter");
  await expect(source(h.page)).toHaveCount(0);
  await expect(formula(h.page)).toHaveAttribute("data-selected", "true");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("x^2"));
  await sleep(SETTLE_MS);
  // The formula, then the empty line opened under it to write on.
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n$$\nx^2\n$$\n\n");
  expect(h.pageErrors).toEqual([]);
});

test("a one-line formula from the file stays one line, and Enter on it selected reopens it", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n\n$$E = mc^2$$\n\nAfter.\n" });
  await h.openNote("Maths");
  await expect(formula(h.page).locator(".katex annotation")).toHaveText("E = mc^2");
  await formula(h.page).getByRole("button", { name: "Edit formula" }).click();
  await expect(source(h.page)).toBeFocused();
  await expect(source(h.page)).toHaveValue("E = mc^2");
  await h.page.keyboard.type("+1");
  await h.page.keyboard.press("Escape");
  await expect(formula(h.page)).toHaveAttribute("data-selected", "true");
  await h.page.keyboard.press("Enter");
  await expect(source(h.page)).toBeFocused();
  await h.page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(source(h.page)).toHaveCount(0);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("+1"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n$$E = mc^2+1$$\n\nAfter.\n");
  expect(h.pageErrors).toEqual([]);
});

test("broken syntax keeps the last drawing with a reason, and Cmd+Z takes the typing back", async () => {
  h = await launchApp({ [NOTE]: "$$\na + b\n$$\n" });
  await h.openNote("Maths");
  await formula(h.page).getByRole("button", { name: "Edit formula" }).click();
  await h.page.keyboard.type(" + \\frac{");
  await expect(formula(h.page).getByRole("status")).toContainText("last version that worked");
  await expect(formula(h.page).locator(".katex annotation")).toHaveText("a + b +");
  await sleep(SETTLE_MS);
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(source(h.page)).toHaveValue("a + b");
  await expect(formula(h.page).getByRole("status")).toHaveCount(0);
  await h.page.keyboard.press("Escape");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("$$\na + b\n$$\n");
  expect(h.pageErrors).toEqual([]);
});

test("ArrowDown from the source's last line walks to the paragraph under it", async () => {
  h = await launchApp({ [NOTE]: "$$\na\n$$\n\nAfter.\n" });
  await h.openNote("Maths");
  await formula(h.page).getByRole("button", { name: "Edit formula" }).click();
  await h.page.keyboard.press("ArrowDown");
  await expect(source(h.page)).toHaveCount(0);
  await h.page.keyboard.type("X");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("$$\na\n$$\n\nXAfter.\n");
  expect(h.pageErrors).toEqual([]);
});
