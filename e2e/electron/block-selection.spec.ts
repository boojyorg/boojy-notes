/**
 * Whole-block selection of text blocks: the grip's click selects the block
 * (marker included), Shift extends the run, Escape from the text selects the
 * block the caret is in, and a selected run is copied, deleted or dragged
 * whole. A list item always brings the items nested under it. Pointer
 * geometry, focus and the clipboard, so proven in the real app.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp, MOD, sleep } from "./harness";

// One at a time: each test saves and restores the OS clipboard, and a
// neighbour's restore landing mid-copy read back the wrong text.
test.describe.configure({ mode: "default" });

let h: AppHandle;
let savedClipboard = "";

const NOTE = "Intro.\n\n- Parent\n  - Child\n- Sibling\n\nOutro.\n";

const roots = (page: Page) => page.locator("[data-editor] > [data-block-id]");
/** The rows' texts, less the empty row the note ends on. */
const texts = async (page: Page) =>
  (await roots(page).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const outro = (page: Page) => roots(page).filter({ hasText: "Outro." });
const grip = (page: Page) => page.locator('[data-testid="block-drag-handle"]');

/** The texts of the rows that wear the selection wash. */
const washed = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
      .filter((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)")
      .map((el) => el.innerText.trim()),
  );

async function hoverGrip(page: Page, n: number) {
  const box = await roots(page).nth(n).boundingBox();
  if (!box) throw new Error("block not visible");
  await page.mouse.move(box.x + 40, box.y + Math.min(12, box.height / 2));
  const id = await roots(page).nth(n).getAttribute("data-block-id");
  const g = page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
  await g.waitFor({ timeout: 2_000 });
  const gb = await g.boundingBox();
  await page.mouse.move(gb!.x + gb!.width / 2, gb!.y + gb!.height / 2);
  return gb!;
}

async function clickGrip(page: Page, n: number, shift = false) {
  await hoverGrip(page, n);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test.beforeEach(async () => {
  h = await launchApp({ "Note.md": NOTE });
  savedClipboard = await h.app.evaluate(({ clipboard }) => clipboard.readText());
  await h.openNote("Note");
  await roots(h.page).first().waitFor();
});
test.afterEach(async () => {
  await h?.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), savedClipboard);
  await h?.close();
});

test("the grip names its gestures after a rest", async () => {
  await hoverGrip(h.page, 0);
  await expect(h.page.getByTestId("grip-tooltip")).toHaveText("Drag to moveClick for options");
});

test("a click on the grip selects the whole row, and a letter typed deselects and writes on", async () => {
  await hoverGrip(h.page, 0);
  await expect(h.page.getByTestId("grip-tooltip")).toBeVisible();
  await h.page.mouse.down();
  await h.page.mouse.up();
  // The press answers the chip: it goes, and stays gone while the pointer rests.
  await sleep(600);
  await expect(h.page.getByTestId("grip-tooltip")).toHaveCount(0);
  expect(await washed(h.page)).toEqual(["Intro."]);
  await h.page.keyboard.press("Escape"); // the menu the click opened
  await h.page.keyboard.type("!");
  expect(await washed(h.page)).toEqual([]);
  await expect(roots(h.page).first()).toHaveText("Intro.!");
});

test("a list item is selected with its nested items, and Shift extends the run", async () => {
  await clickGrip(h.page, 1);
  expect(await washed(h.page)).toEqual(["Parent", "Child"]);
  await h.page.keyboard.press("Escape"); // the menu the click opened
  await h.page.keyboard.press("Shift+ArrowDown");
  expect(await washed(h.page)).toEqual(["Parent", "Child", "Sibling"]);
  await h.page.keyboard.press("Shift+ArrowUp");
  expect(await washed(h.page)).toEqual(["Parent", "Child"]);
  // Shift-click on another block's text grows the run to it.
  await outro(h.page).click({ modifiers: ["Shift"] });
  expect(await washed(h.page)).toEqual(["Parent", "Child", "Sibling", "Outro."]);
});

test("Cmd+C copies the run as Markdown; Backspace removes it in one step and Cmd+Z brings it back", async () => {
  await clickGrip(h.page, 1);
  await h.page.keyboard.press("Escape");
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.keyboard.press(`${MOD}+c`);
  await expect
    .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe("- Parent\n  - Child\n- Sibling");
  await h.page.keyboard.press("Backspace");
  expect(await texts(h.page)).toEqual(["Intro.", "Outro."]);
  await h.page.keyboard.press(`${MOD}+z`);
  await expect
    .poll(() => texts(h.page))
    .toEqual(["Intro.", "Parent", "Child", "Sibling", "Outro."]);
});

test("Escape in the text selects the block; Escape again gives the caret back where it was", async () => {
  await outro(h.page).click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press("Escape");
  expect(await washed(h.page)).toEqual(["Outro."]);
  await h.page.keyboard.press("Escape");
  expect(await washed(h.page)).toEqual([]);
  await h.page.keyboard.type("!");
  await expect(outro(h.page)).toHaveText("Outro.!");
});

test("a press anywhere off the selection deselects, through the open menu's backdrop too", async () => {
  await clickGrip(h.page, 0);
  // The menu is open: the press lands on its backdrop, as a real pointer's does.
  const box = await outro(h.page).boundingBox();
  await h.page.mouse.click(box!.x + 10, box!.y + box!.height / 2);
  await expect(h.page.getByRole("menu", { name: "Block options" })).toHaveCount(0);
  expect(await washed(h.page)).toEqual([]);
});

test("dragging a list item's grip carries its nested items", async () => {
  const g = await hoverGrip(h.page, 1);
  const gx = g.x + g.width / 2;
  const gy = g.y + g.height / 2;
  await h.page.mouse.down();
  await h.page.mouse.move(gx, gy + 8, { steps: 2 });
  await h.page.waitForFunction(() => document.body.classList.contains("block-dragging"));
  // The copy under the pointer is the whole rows: both items, each with its marker.
  const ghost = await h.page.evaluate(() => {
    const clone = Array.from(document.body.children).find(
      (el) =>
        (el as HTMLElement).style.pointerEvents === "none" && el.querySelector("[data-block-id]"),
    ) as HTMLElement | undefined;
    return {
      text: clone?.innerText.replace(/\s+/g, " ").trim(),
      markers: clone?.querySelectorAll("[data-marker]").length,
    };
  });
  expect(ghost).toEqual({ text: "Parent Child", markers: 2 });
  const below = await outro(h.page).boundingBox();
  await h.page.mouse.move(gx, below!.y + below!.height - 2, { steps: 6 });
  await sleep(50);
  await h.page.mouse.up();
  await expect
    .poll(() => texts(h.page))
    .toEqual(["Intro.", "Sibling", "Outro.", "Parent", "Child"]);
});

// ── The grip's menu ───────────────────────────────────────────────────────

const menu = (page: Page) => page.getByRole("menu", { name: "Block options" });
const types = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
      .filter((el) => el.innerText.trim())
      .map((el) => `${el.dataset.blockType}:${el.innerText.trim()}`),
  );

test("a click on the grip opens its menu: what is selected, then Turn into, Copy, Duplicate, Delete", async () => {
  await clickGrip(h.page, 0);
  await expect(menu(h.page)).toBeVisible();
  await expect(menu(h.page)).toContainText("Text");
  const mod = process.platform === "darwin" ? "⌘" : "Ctrl+";
  expect(await menu(h.page).getByRole("menuitem").allInnerTexts()).toEqual([
    "Turn into",
    `Copy\n${mod}C`,
    `Duplicate\n${mod}D`,
    "Delete\n⌫",
  ]);
  // Escape closes the menu and keeps the selection; again gives the caret back.
  await h.page.keyboard.press("Escape");
  await expect(menu(h.page)).toHaveCount(0);
  expect(await washed(h.page)).toEqual(["Intro."]);
  await h.page.keyboard.press("Escape");
  expect(await washed(h.page)).toEqual([]);
});

test("Turn into by pointer: hover opens the kinds beside the menu, a click converts", async () => {
  await clickGrip(h.page, 0);
  await menu(h.page).getByRole("menuitem", { name: "Turn into" }).hover();
  const kinds = h.page.getByRole("menu", { name: "Turn into" });
  await expect(kinds.getByRole("menuitemradio", { name: "Text" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await kinds.getByRole("menuitemradio", { name: "Heading 1" }).click();
  await expect(menu(h.page)).toHaveCount(0);
  expect((await types(h.page))[0]).toBe("h1:Intro.");
});

test("Turn into by keyboard: Escape selects, Shift+F10 opens the menu, → the kinds", async () => {
  await outro(h.page).click();
  await h.page.keyboard.press("Escape");
  await h.page.keyboard.press("Shift+F10");
  await expect(menu(h.page)).toBeVisible();
  await h.page.keyboard.press("ArrowDown"); // Turn into
  await h.page.keyboard.press("ArrowRight");
  // The kinds open on the current one (Text); two down is Heading 2.
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("Enter");
  expect(await types(h.page)).toContain("h2:Outro.");
});

test("⌘D duplicates the selected blocks under them and selects the copies; with a caret, its line", async () => {
  await clickGrip(h.page, 1);
  await h.page.keyboard.press("Escape"); // close the menu, keep the selection
  await h.page.keyboard.press(`${MOD}+d`);
  expect(await texts(h.page)).toEqual([
    "Intro.",
    "Parent",
    "Child",
    "Parent",
    "Child",
    "Sibling",
    "Outro.",
  ]);
  const selected = await washed(h.page);
  expect(selected).toEqual(["Parent", "Child"]);
  await h.page.keyboard.press("Escape");
  await outro(h.page).click();
  await h.page.keyboard.press(`${MOD}+d`);
  expect((await texts(h.page)).slice(-2)).toEqual(["Outro.", "Outro."]);
});

test("Delete in the menu removes the selection in one step", async () => {
  await clickGrip(h.page, 1);
  await menu(h.page)
    .getByRole("menuitem", { name: /Delete/ })
    .click();
  expect(await texts(h.page)).toEqual(["Intro.", "Sibling", "Outro."]);
});

test("a click on a bullet's dot selects the item with its nested items: no menu, the grip plain", async () => {
  const row = roots(h.page).nth(1);
  const dot = (await row.locator("[data-marker]").boundingBox())!;
  await h.page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
  expect(await washed(h.page)).toEqual(["Parent", "Child"]);
  await expect(h.page.getByRole("menu", { name: "Block options" })).toHaveCount(0);
  await expect(h.page.locator('[data-testid="block-drag-handle"][data-pressed]')).toHaveCount(0);
  // The keys act on it as on any selection.
  await h.page.keyboard.press("Shift+ArrowDown");
  expect(await washed(h.page)).toEqual(["Parent", "Child", "Sibling"]);
  // A click in the item's text is the text's.
  await h.page.keyboard.press("Escape");
  await row.locator('[role="textbox"]').click();
  expect(await washed(h.page)).toEqual([]);
});

test("a grip click leaves the grip pressed", async () => {
  await clickGrip(h.page, 1);
  await expect(h.page.locator('[data-testid="block-drag-handle"][data-pressed]')).toHaveCount(1);
});

test("every block's gutter, between the grip and its content, selects it; a to-do's box still ticks", async () => {
  const g = await launchApp({
    "Kinds.md": "# Title\n\nA paragraph.\n\n- [ ] A task\n\n```js\nlet a = 1;\n```\n\nEnd.\n",
  });
  try {
    await g.openNote("Kinds");
    const row = (type: string) =>
      g.page.locator(`[data-editor] > [data-block-type="${type}"]`).first();
    const tint = () => washed(g.page);
    const clickLeftOf = async (type: string, x: (b: { x: number }) => number) => {
      const b = (await row(type).boundingBox())!;
      await g.page.mouse.move(b.x + 40, b.y + 8);
      await g.page.mouse.click(x(b), b.y + Math.min(12, b.height / 2));
    };
    // Paragraph and heading: the gap left of the first letter.
    await clickLeftOf("p", (b) => b.x - 4);
    expect(await tint()).toEqual(["A paragraph."]);
    await clickLeftOf("h1", (b) => b.x - 4);
    expect(await tint()).toEqual(["Title"]);
    // A to-do: left of its box selects; the box itself ticks.
    await clickLeftOf("checkbox", (b) => b.x - 2);
    expect(await tint()).toEqual(["A task"]);
    await g.page.locator(".checkbox-hit").first().click();
    await expect(g.page.locator(".checkbox-hit").first()).toHaveAttribute("aria-checked", "true");
    // A code block: the gap left of it.
    await clickLeftOf("code", (b) => b.x - 4);
    // Selected: Backspace removes the whole block.
    await g.page.keyboard.press("Backspace");
    await expect(g.page.locator('[data-editor] > [data-block-type="code"]')).toHaveCount(0);
    // No menu in any of these: that is the grip's.
    await expect(g.page.getByRole("menu", { name: "Block options" })).toHaveCount(0);
  } finally {
    await g.close();
  }
});
