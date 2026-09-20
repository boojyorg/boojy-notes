/**
 * The selection toolbar shows over a finished selection, not under a drag:
 * with the mouse button down it is absent however far the selection has
 * grown, it appears on release; a keyboard selection (Shift+Arrow) shows it
 * after a short rest. Its buttons are Lucide glyphs named by their label,
 * resting on one shows its name and shortcut, and pressing one formats the
 * selection and writes the Markdown to disk while the toolbar stays put with
 * the button pressed.
 *
 * Needs the real app: the timing lives between Chromium's selectionchange
 * events, the document mouseup and the hook's timer.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Draft.md";
const LINE = "The quick brown fox";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: `${LINE}\n` });
  await h.openNote("Draft");
});

test.afterEach(async () => {
  await h?.close();
});

const toolbar = (page: AppHandle["page"]) => page.getByRole("toolbar", { name: "Text formatting" });

/** The x position of character `index` in the first block. */
async function charX(page: AppHandle["page"], index: number) {
  return page
    .locator("[data-block-id]")
    .first()
    .evaluate((el, i) => {
      const text = el.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const r = range.getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2 };
    }, index);
}

test("a pointer selection shows the toolbar on release, not while dragging", async () => {
  const from = await charX(h.page, 4);
  const to = await charX(h.page, 9);
  await h.page.mouse.move(from.x, from.y);
  await h.page.mouse.down();
  await h.page.mouse.move(to.x, to.y, { steps: 6 });
  // The selection exists and has grown; the toolbar has not appeared.
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe("quick");
  await sleep(500);
  await expect(toolbar(h.page)).toHaveCount(0);

  await h.page.mouse.up();
  await expect(toolbar(h.page)).toBeVisible();
  expect(h.pageErrors).toEqual([]);
});

test("a keyboard selection shows the toolbar after a rest", async () => {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press("Home");
  for (let i = 0; i < 3; i++) {
    await h.page.keyboard.press("Shift+ArrowRight");
    await sleep(80);
  }
  // Inside the rest window nothing shows; after it, the toolbar does.
  await expect(toolbar(h.page)).toHaveCount(0);
  await expect(toolbar(h.page)).toBeVisible({ timeout: 2_000 });
  expect(h.pageErrors).toEqual([]);
});

test("the buttons are named Lucide glyphs, and resting on one shows its shortcut", async () => {
  await h.page.locator("[data-block-id]").first().dblclick();
  const bar = toolbar(h.page);
  await expect(bar).toBeVisible();
  const names = await bar
    .getByRole("button")
    .evaluateAll((els) =>
      els.map((e) => [e.getAttribute("aria-label"), !!e.querySelector("svg.lucide")]),
    );
  expect(names).toEqual([
    ["Bold", true],
    ["Italic", true],
    ["Strikethrough", true],
    ["Highlight", true],
    ["Inline code", true],
    ["Link", true],
  ]);

  await bar.getByRole("button", { name: "Bold" }).hover();
  const tip = h.page.getByTestId("format-tooltip");
  await expect(tip).toBeVisible({ timeout: 2_000 });
  expect(await tip.textContent()).toBe(process.platform === "darwin" ? "Bold⌘B" : "BoldCtrl+B");
  await h.page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

// The scroller is overflow-x: hidden, so a strip centred on the first word of
// a line used to have its left half scissored off (2026-09-19). A narrow
// window puts the column's gutter at its floor, where there is no room for the
// strip's 94px half.
test("the toolbar steps inside the column rather than being cut off at its edge", async () => {
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(640, 800);
  });
  await expect
    .poll(async () => await h.page.evaluate(() => window.innerWidth), { timeout: 5_000 })
    .toBe(640);
  // The column's padding and width ease to their new size; a strip placed
  // mid-transition is placed against a column that is still moving.
  await h.page.evaluate(async () => {
    for (let round = 0; round < 10; round++) {
      const running = document.getAnimations();
      if (running.length === 0) return;
      await Promise.allSettled(running.map((a) => a.finished));
    }
  });
  const first = await charX(h.page, 1);
  await h.page.mouse.dblclick(first.x, first.y);
  const bar = toolbar(h.page);
  await expect(bar).toBeVisible({ timeout: 2_000 });
  expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe("The");
  const box = (await bar.boundingBox())!;
  const scroller = await h.page
    .locator(".editor-scroll")
    .evaluate((el) => el.getBoundingClientRect().toJSON());
  // Whole, and inside: centred on the word it would start left of the column.
  expect(box.x).toBeGreaterThanOrEqual(scroller.left);
  expect(box.x + box.width).toBeLessThanOrEqual(scroller.right);
  expect(box.x).toBeGreaterThan(first.x - box.width / 2);
  expect(h.pageErrors).toEqual([]);
});

// The pressed glyph used to wait for the 300ms text commit to publish, because
// the editor's text-only render skip swallowed the toolbar's own refresh.
test("a pressed format lights with the press, not a beat later", async () => {
  const word = await charX(h.page, 5);
  await h.page.mouse.dblclick(word.x, word.y);
  const bar = toolbar(h.page);
  await expect(bar).toBeVisible({ timeout: 2_000 });
  // The press and the read are one turn of the page's own event loop: React
  // flushes a discrete event's update in the microtask after the dispatch, so
  // this is the first moment the eye could see anything. Before the fix it
  // read `false` here and flipped 300ms later, with the debounced text commit.
  const pressed = await bar.getByRole("button", { name: "Bold" }).evaluate(async (el) => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    return el.getAttribute("aria-pressed");
  });
  expect(pressed).toBe("true");
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("quick");
  expect(h.pageErrors).toEqual([]);
});

test("pressing Italic formats the selection and writes it to disk", async () => {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press("Home");
  await h.page.keyboard.press(`${MOD}+a`);
  const bar = toolbar(h.page);
  await expect(bar).toBeVisible({ timeout: 2_000 });
  // The toolbar acts on mouse-down so the selection survives the press.
  const barEl = await bar.elementHandle();
  // Let the 120ms fade-in (a 4px lift) settle before taking the position.
  await sleep(250);
  const before = await bar.boundingBox();
  await bar.getByRole("button", { name: "Italic" }).dispatchEvent("mousedown");
  // Chromium's own italic command wraps in <i>; the walker reads it as *…* all the same.
  await expect(h.page.locator("[data-block-id] em, [data-block-id] i")).toHaveText(LINE);
  // The toolbar never left: the same element is still there, its button now pressed.
  for (const wait of [0, 120, 250, 450]) {
    await sleep(wait);
    expect(await barEl?.evaluate((e) => e.isConnected)).toBe(true);
  }
  await expect(bar.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  // And it has not moved: the wider glyphs shifted the selection, not the strip.
  expect(await bar.boundingBox()).toEqual(before);
  await bar.getByRole("button", { name: "Italic" }).dispatchEvent("mousedown");
  await expect(bar.getByRole("button", { name: "Italic" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await barEl?.evaluate((e) => e.isConnected)).toBe(true);
  await bar.getByRole("button", { name: "Italic" }).dispatchEvent("mousedown");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("*"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(`*${LINE}*\n`);
  expect(h.pageErrors).toEqual([]);
});

// The backtick is a dead accent key on Spanish and most European layouts, and
// with Cmd held reports "Dead", so Cmd+` never fired there. Cmd+E is what the
// chip shows (2026-09-20); the backtick still works where the layout gives it.
test("Cmd+E makes inline code, and the chip says so", async () => {
  const block = h.page.locator("[data-block-id]").first();
  await block.click();
  await h.page.keyboard.press("End");
  for (let i = 0; i < 3; i++) await h.page.keyboard.press("Shift+ArrowLeft");
  await h.page.keyboard.press(`${MOD}+e`);
  await expect(block).toHaveText(LINE);
  expect(await block.innerHTML()).toContain("<code>fox</code>");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("brown `fox`"));

  await h.page.keyboard.press(`${MOD}+e`);
  expect(await block.innerHTML()).not.toContain("<code>");
  await h.page.keyboard.press(`${MOD}+\``);
  expect(await block.innerHTML()).toContain("<code>fox</code>");

  await sleep(SETTLE_MS);
  const bar = toolbar(h.page);
  await bar.getByRole("button", { name: "Inline code" }).hover();
  const tip = h.page.getByTestId("format-tooltip");
  await expect(tip).toBeVisible({ timeout: 2_000 });
  expect(await tip.textContent()).toBe(
    process.platform === "darwin" ? "Inline code⌘E" : "Inline codeCtrl+E",
  );
  expect(h.pageErrors).toEqual([]);
});

// The toolbar opens the link field on mousedown; the field's own "press
// outside closes" listener used to catch that same press (2026-09-20).
test("the toolbar's Link glyph opens the link field, as Cmd+K does", async () => {
  const block = h.page.locator("[data-block-id]").first();
  await block.click();
  await h.page.keyboard.press("End");
  for (let i = 0; i < 3; i++) await h.page.keyboard.press("Shift+ArrowLeft");
  await sleep(SETTLE_MS);
  const bar = toolbar(h.page);
  const btn = bar.getByRole("button", { name: "Link" });
  const box = (await btn.boundingBox())!;
  await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await h.page.mouse.down();
  await h.page.mouse.up();
  const url = h.page.getByPlaceholder("Paste a link or search notes…");
  await expect(url).toBeVisible();
  await expect(url).toBeFocused();
  await h.page.keyboard.type("https://example.com");
  await h.page.keyboard.press("Enter");
  await expect(url).toHaveCount(0);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("brown [fox](https://example.com)"));
  // A press outside still closes it.
  await block.click();
  await h.page.keyboard.press("End");
  for (let i = 0; i < 3; i++) await h.page.keyboard.press("Shift+ArrowLeft");
  await h.page.keyboard.press(`${MOD}+k`);
  await expect(url).toBeVisible();
  await h.page.mouse.click(5, 300);
  await expect(url).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});
