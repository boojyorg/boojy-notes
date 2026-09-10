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

test("pressing Italic formats the selection and writes it to disk", async () => {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press("Home");
  await h.page.keyboard.press(`${MOD}+a`);
  const bar = toolbar(h.page);
  await expect(bar).toBeVisible({ timeout: 2_000 });
  // The toolbar acts on mouse-down so the selection survives the press.
  const barEl = await bar.elementHandle();
  await bar.getByRole("button", { name: "Italic" }).dispatchEvent("mousedown");
  // Chromium's own italic command wraps in <i>; the walker reads it as *…* all the same.
  await expect(h.page.locator("[data-block-id] em, [data-block-id] i")).toHaveText(LINE);
  // The toolbar never left: the same element is still there, its button now pressed.
  for (const wait of [0, 120, 250, 450]) {
    await sleep(wait);
    expect(await barEl?.evaluate((e) => e.isConnected)).toBe(true);
  }
  await expect(bar.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
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
