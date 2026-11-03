/**
 * The grip's menu acts on the run it was opened on (`gripSelection`): a grip
 * pressed in a whole-block selection keeps it, and one in a text selection
 * across several lines takes those lines; Turn into, Duplicate and Delete then
 * act on all of it, in one undo step. A grip outside starts afresh, and the
 * gutter strip is a fresh pick with no menu. Pointer, focus and the document
 * selection, so proven in the real app.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp, MOD } from "./harness";

let h: AppHandle;

const NOTE = "- One\n- Two\n  - Kid\n- Three\n\nEnd.\n";

const roots = (page: Page) => page.locator("[data-editor] > [data-block-id]");
const menu = (page: Page) => page.getByRole("menu", { name: "Block options" });
const types = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
      .filter((el) => el.innerText.trim())
      .map((el) => `${el.dataset.blockType}:${el.innerText.trim()}`),
  );
const washed = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
      .filter((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)")
      .map((el) => el.innerText.trim()),
  );
const pressedGrip = (page: Page) => page.locator('[data-testid="block-drag-handle"][data-pressed]');

async function hoverGrip(page: Page, n: number) {
  const box = await roots(page).nth(n).boundingBox();
  if (!box) throw new Error("block not visible");
  await page.mouse.move(box.x + 40, box.y + Math.min(12, box.height / 2));
  const id = await roots(page).nth(n).getAttribute("data-block-id");
  const g = page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
  await g.waitFor({ timeout: 2_000 });
  const gb = (await g.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  return id;
}

async function clickGrip(page: Page, n: number, { shift = false, right = false } = {}) {
  const id = await hoverGrip(page, n);
  if (shift) await page.keyboard.down("Shift");
  const button = right ? "right" : "left";
  await page.mouse.down({ button });
  await page.mouse.up({ button });
  if (shift) await page.keyboard.up("Shift");
  return id;
}

/** One, Two (with Kid) and Three selected whole: One's grip, then Shift on Three's. */
async function selectAllBullets(page: Page) {
  await clickGrip(page, 0);
  await page.keyboard.press("Escape"); // the menu the click opened
  await clickGrip(page, 3, { shift: true });
  expect(await washed(page)).toEqual(["One", "Two", "Kid", "Three"]);
}

/** A text selection from One's first letter down into Two. */
async function selectTextOneToTwo(page: Page) {
  await roots(page).nth(0).locator('[role="textbox"]').click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.press("Shift+ArrowDown");
  // Into Two's text: a line counts only if the selection holds some of it.
  await page.keyboard.press("Shift+ArrowRight");
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false);
}

async function turnIntoTodo(page: Page) {
  await menu(page).getByRole("menuitem", { name: "Turn into" }).hover();
  await page
    .getByRole("menu", { name: "Turn into" })
    .getByRole("menuitemradio", { name: "To-do list" })
    .click();
  await expect(menu(page)).toHaveCount(0);
}

const BULLETS = ["bullet:One", "bullet:Two", "bullet:Kid", "bullet:Three", "p:End."];

// Kinds with different margins: the note's first line (a heading, its lift),
// a paragraph, a list, a to-do, so a copy that drops a margin shows.
const MIXED = "## Heading\n\nA paragraph.\n\n- Bullet\n- [ ] Task\n\nEnd.\n";

/** The copy's top and its rows' tops, against the originals', while a drag is live. */
const copyPlaces = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    const copy = document.querySelector<HTMLElement>("[data-drag-copy]");
    if (!copy) return null;
    const top = (el: Element | null | undefined) => el?.getBoundingClientRect().top ?? Number.NaN;
    const original = ids.map((id) =>
      top(document.querySelector(`[data-editor] > [data-block-id="${id}"]`)),
    );
    const rows = Array.from(copy.children).map((c) => top(c));
    return { top: top(copy), rows, original };
  }, ids);

/** Press block `n`'s grip and move past the drag threshold: the drag is live. */
async function startDrag(page: Page, n: number) {
  await hoverGrip(page, n);
  await page.mouse.down();
  const g = (await page.locator('[data-testid="block-drag-handle"]').boundingBox())!;
  const x = g.x + g.width / 2;
  const y = g.y + g.height / 2;
  await page.mouse.move(x, y + 6, { steps: 2 });
  await page.waitForFunction(() => document.body.classList.contains("block-dragging"));
  return { x, y: y + 6 };
}

const blockIds = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]")).map(
      (el) => el.dataset.blockId!,
    ),
  );

test.beforeEach(async () => {
  h = await launchApp({ "List.md": NOTE, "Mixed.md": MIXED });
  await h.openNote("List");
  await roots(h.page).first().waitFor();
});
test.afterEach(async () => {
  await h?.close();
});

test("the middle grip of a selected run turns all of it into to-dos, and one ⌘Z turns it back", async () => {
  await selectAllBullets(h.page);
  const middle = await clickGrip(h.page, 1);
  await expect(menu(h.page)).toBeVisible();
  expect(await washed(h.page)).toEqual(["One", "Two", "Kid", "Three"]);
  // The grip pressed is the one clicked, beside the menu it opened.
  await expect(pressedGrip(h.page)).toHaveAttribute("data-target-block", middle!);
  await turnIntoTodo(h.page);
  expect(await types(h.page)).toEqual([
    "checkbox:One",
    "checkbox:Two",
    "checkbox:Kid",
    "checkbox:Three",
    "p:End.",
  ]);
  await h.page.keyboard.press(`${MOD}+z`);
  await expect.poll(() => types(h.page)).toEqual(BULLETS);
});

for (const right of [false, true]) {
  test(`a grip ${right ? "right-clicked" : "clicked"} in a text selection acts on its lines, a parent with its children`, async () => {
    await selectTextOneToTwo(h.page);
    await clickGrip(h.page, 0, { right });
    await expect(menu(h.page)).toBeVisible();
    // The text touched One and Two; Two brings Kid. Three is untouched.
    expect(await washed(h.page)).toEqual(["One", "Two", "Kid"]);
    await turnIntoTodo(h.page);
    expect(await types(h.page)).toEqual([
      "checkbox:One",
      "checkbox:Two",
      "checkbox:Kid",
      "bullet:Three",
      "p:End.",
    ]);
  });
}

test("Delete from a kept run removes all of it, and one ⌘Z brings it back", async () => {
  await selectAllBullets(h.page);
  await clickGrip(h.page, 2);
  await menu(h.page)
    .getByRole("menuitem", { name: /Delete/ })
    .click();
  await expect.poll(() => types(h.page)).toEqual(["p:End."]);
  await h.page.keyboard.press(`${MOD}+z`);
  await expect.poll(() => types(h.page)).toEqual(BULLETS);
});

test("Duplicate from a kept run copies all of it", async () => {
  await selectAllBullets(h.page);
  await clickGrip(h.page, 1);
  await menu(h.page)
    .getByRole("menuitem", { name: /Duplicate/ })
    .click();
  await expect
    .poll(() => types(h.page))
    .toEqual([...BULLETS.slice(0, 4), ...BULLETS.slice(0, 4), "p:End."]);
});

test("a grip outside the run starts afresh", async () => {
  await selectAllBullets(h.page);
  await clickGrip(h.page, 4);
  expect(await washed(h.page)).toEqual(["End."]);
});

test("a gutter press inside the run picks that block alone, with no menu", async () => {
  await selectAllBullets(h.page);
  const dot = (await roots(h.page).nth(3).locator("[data-marker]").boundingBox())!;
  await h.page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2);
  expect(await washed(h.page)).toEqual(["Three"]);
  await expect(menu(h.page)).toHaveCount(0);
  await expect(pressedGrip(h.page)).toHaveCount(0);
});

for (const [from, name] of [
  [3, "the last"],
  [1, "a middle"],
] as const) {
  test(`dragged from ${name} grip, the run's copy starts over the run and moves with the pointer`, async () => {
    await selectAllBullets(h.page);
    const ids = (await blockIds(h.page)).slice(0, 4);
    const at = await startDrag(h.page, from);
    // At activation: over the run, its first row on One, not on the block grabbed.
    const start = (await copyPlaces(h.page, ids))!;
    expect(Math.abs(start.top - start.original[0])).toBeLessThanOrEqual(1);
    // Then one-for-one with the pointer.
    await h.page.mouse.move(at.x, at.y + 30, { steps: 3 });
    const moved = (await copyPlaces(h.page, ids))!;
    expect(Math.abs(moved.top - start.top - 30)).toBeLessThanOrEqual(1);
    // Escape: it goes home, and nothing moved.
    await h.page.keyboard.press("Escape");
    await expect(h.page.locator("[data-drag-copy]")).toHaveCount(0);
    await h.page.mouse.up();
    expect(await types(h.page)).toEqual(BULLETS);
  });
}

test("a mixed run's copy matches the page, row for row, from its last block's grip", async () => {
  await h.openNote("Mixed");
  await roots(h.page).first().waitFor();
  await clickGrip(h.page, 0);
  await h.page.keyboard.press("Escape");
  await clickGrip(h.page, 3, { shift: true });
  expect(await washed(h.page)).toEqual(["Heading", "A paragraph.", "Bullet", "Task"]);
  const ids = (await blockIds(h.page)).slice(0, 4);
  await startDrag(h.page, 3);
  const p = (await copyPlaces(h.page, ids))!;
  expect(p.rows).toHaveLength(4);
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(p.rows[i] - p.top - (p.original[i] - p.original[0]))).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(p.top - p.original[0])).toBeLessThanOrEqual(1);
  await h.page.keyboard.press("Escape");
  await h.page.mouse.up();
});

test("a run dragged from its last grip and dropped below End. lands there, in order", async () => {
  await selectAllBullets(h.page);
  const at = await startDrag(h.page, 3);
  const end = (await roots(h.page).nth(4).boundingBox())!;
  await h.page.mouse.move(at.x, end.y + end.height - 2, { steps: 6 });
  await h.page.mouse.up();
  await expect.poll(() => types(h.page)).toEqual(["p:End.", ...BULLETS.slice(0, 4)]);
});
