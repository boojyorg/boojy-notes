/**
 * The chrome row's chips: the app's own tooltip under a control, naming it
 * with its shortcut on a pill, in place of the browser's `title` tooltip.
 * Needs the real window: the rest timer, the hover, and the chip's place over
 * the sidebar's edge and against the window's edge are what is being proved.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const TOOLTIP_REST_MS = 400;

/**
 * Hover a control until its chip reads `text`. On the Linux runner the X
 * pointer sits at the screen's centre, and when another worker's window
 * appears Chromium receives a real `mouseout` to that point (probed
 * 2026-09-17: `mouseout … rel=null xy=600,373` some 500 ms after the hover),
 * which is a mouseleave to the control and cancels the chip's rest. A user's
 * pointer would not have moved; the test's has, so it hovers again.
 */
async function hoverForChip(control: import("@playwright/test").Locator, text: RegExp | string) {
  const chip = control.page().getByTestId("chrome-tooltip");
  await expect(async () => {
    await control.hover();
    await expect(chip).toHaveText(text, { timeout: TOOLTIP_REST_MS * 3 });
  }).toPass({ timeout: 10_000 });
}

/**
 * Whether the point is painted by the chip: what a user sees, clipping and
 * stacking included. The chip is `pointer-events: none`, which hit-testing
 * skips, so it takes events for the one probe.
 */
const chipAt = (x: number, y: number) =>
  h.page.evaluate(
    ([px, py]) => {
      const chip = document.querySelector<HTMLElement>("[data-testid='chrome-tooltip']");
      if (!chip) return false;
      chip.style.pointerEvents = "auto";
      const hit = !!document.elementFromPoint(px, py)?.closest("[data-testid='chrome-tooltip']");
      chip.style.pointerEvents = "none";
      return hit;
    },
    [x, y],
  );

test("a chrome control names itself under the pointer, shortcut on a pill, whole past the sidebar's edge", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  // None of the row's controls carries a `title`: the chip is the one tooltip.
  for (const name of ["Toggle sidebar", "Search notes", "Undo", "Redo", "New folder", "Sort"]) {
    const control = h.page.locator(`[aria-label='${name}']:not([inert] *)`);
    await expect(control, name).not.toHaveAttribute("title", /.*/);
  }
  await expect(h.page.getByTestId("wordmark-settings-button")).not.toHaveAttribute("title", /.*/);
  await expect(h.page.locator("button[aria-label='Note actions']")).not.toHaveAttribute(
    "title",
    /.*/,
  );

  const toggle = h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)");
  await hoverForChip(toggle, /^Toggle sidebar(⌘\\|Ctrl\+\\)$/);
  const toggleBox = (await toggle.boundingBox())!;
  const chipBox = (await chip.boundingBox())!;
  // Under the control, centred on it.
  expect(chipBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
  expect(
    Math.abs(chipBox.x + chipBox.width / 2 - (toggleBox.x + toggleBox.width / 2)),
  ).toBeLessThan(2);
  // The toggle sits at the sidebar's right edge and the chip is wider than
  // it: its tail crosses into the editor and is painted there, not clipped.
  const sidebar = (await h.page.locator(".sidebar-action-row").boundingBox())!;
  expect(chipBox.x + chipBox.width).toBeGreaterThan(sidebar.x + sidebar.width);
  expect(await chipAt(chipBox.x + chipBox.width - 3, chipBox.y + chipBox.height / 2)).toBe(true);

  // The shortcut sits beside the name on its own pill.
  await hoverForChip(
    h.page.locator("[aria-label='Search notes']:not([inert] *)"),
    /^Search notes(⌘P|Ctrl\+P)$/,
  );
  const pill = chip.locator("span").last();
  await expect(pill).toHaveText(/⌘P|Ctrl\+P/);
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)",
  );

  // The wordmark's says what the wordmark does, and leaving hides it.
  await hoverForChip(h.page.getByTestId("wordmark-settings-button"), /^Settings(⌘,|Ctrl\+,)$/);
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

test("the Notes row's pair name themselves, a greyed Undo keeps its name, and the ··· chip stays inside the window", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  await hoverForChip(
    h.page.getByRole("button", { name: "New folder", exact: true }),
    /^New folder(⇧⌘N|Ctrl\+Shift\+N)$/,
  );
  await hoverForChip(h.page.getByRole("button", { name: "Sort", exact: true }), "Sort");

  const undo = h.page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await hoverForChip(undo, /^Undo(⌘Z|Ctrl\+Z)$/);
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);

  // The ··· sits 10px from the right edge; its chip shifts in rather than clipping.
  // (The row's ··· is a span with the same name; the header's is the button.)
  await hoverForChip(h.page.locator("button[aria-label='Note actions']"), "Note actions");
  const box = (await chip.boundingBox())!;
  const width = await h.page.evaluate(() => window.innerWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(width - 8 + 0.5);
  expect(await chipAt(box.x + box.width - 3, box.y + box.height / 2)).toBe(true);
  expect(h.pageErrors).toEqual([]);
});

test("keyboard focus shows the chip at once, and activating hides it", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");
  const search = h.page.locator("[aria-label='Search notes']:not([inert] *)");
  // Reached by Tab, as a keyboard user reaches it: focus a script moves after
  // a click is not keyboard focus to the browser, and shows nothing.
  await h.page.getByTestId("wordmark-settings-button").focus();
  await h.page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await expect(chip).toHaveText(/^Search notes/, { timeout: TOOLTIP_REST_MS / 2 });
  await h.page.keyboard.press("Escape");
  await expect(chip).toHaveCount(0);
  await expect(search).toBeFocused();
  expect(h.pageErrors).toEqual([]);
});

// Hover, click, and the button's chip is up; the menu or dialog that opened
// takes focus and, closing, hands it back to the button with the pointer
// elsewhere. That focus is a click's, not the keyboard's, and shows nothing
// (before this the chip stayed up after Settings or the Sort menu closed).
test("a chip does not come back when a closing menu or dialog hands focus to its button", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  const wordmark = h.page.getByTestId("wordmark-settings-button");
  await hoverForChip(wordmark, /^Settings/);
  await wordmark.click();
  const settings = h.page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(chip).toHaveCount(0);
  await h.page.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toBeHidden();
  await expect(wordmark).toBeFocused();
  await expect(chip).toHaveCount(0);

  const sort = h.page.getByRole("button", { name: "Sort", exact: true });
  await hoverForChip(sort, /^Sort/);
  await sort.click();
  const menu = h.page.getByRole("menu", { name: "Sort notes" });
  await expect(menu).toBeVisible();
  await expect(chip).toHaveCount(0);
  await h.page.mouse.click(600, 400);
  await expect(menu).toBeHidden();
  await expect(chip).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});
