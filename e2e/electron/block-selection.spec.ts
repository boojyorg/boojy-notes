/**
 * Whole-block selection of text blocks: the grip's click selects the block
 * (marker included), Shift extends the run, Escape from the text selects the
 * block the caret is in, and a selected run is copied, deleted or dragged
 * whole. A list item always brings the items nested under it. Pointer
 * geometry, focus and the clipboard, so proven in the real app.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp, MOD, sleep } from "./harness";

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
  await expect(h.page.getByTestId("grip-tooltip")).toHaveText("Drag to moveClick to select");
});

test("a click on the grip selects the whole row, and a letter typed deselects and writes on", async () => {
  await clickGrip(h.page, 0);
  expect(await washed(h.page)).toEqual(["Intro."]);
  await h.page.keyboard.type("!");
  expect(await washed(h.page)).toEqual([]);
  await expect(roots(h.page).first()).toHaveText("Intro.!");
});

test("a list item is selected with its nested items, and Shift extends the run", async () => {
  await clickGrip(h.page, 1);
  expect(await washed(h.page)).toEqual(["Parent", "Child"]);
  await h.page.keyboard.press("Shift+ArrowDown");
  expect(await washed(h.page)).toEqual(["Parent", "Child", "Sibling"]);
  await h.page.keyboard.press("Shift+ArrowUp");
  expect(await washed(h.page)).toEqual(["Parent", "Child"]);
  await clickGrip(h.page, 4, true);
  expect(await washed(h.page)).toEqual(["Parent", "Child", "Sibling", "Outro."]);
});

test("Cmd+C copies the run as Markdown; Backspace removes it in one step and Cmd+Z brings it back", async () => {
  await clickGrip(h.page, 1);
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

test("a press anywhere off the selection deselects", async () => {
  await clickGrip(h.page, 0);
  await outro(h.page).click();
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
