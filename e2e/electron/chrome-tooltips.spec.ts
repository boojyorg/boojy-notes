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
  await toggle.hover();
  await expect(chip).toHaveText("Toggle sidebar");
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
  await h.page.locator("[aria-label='Search notes']:not([inert] *)").hover();
  await expect(chip).toHaveText(/^Search notes(⌘P|Ctrl\+P)$/);
  const pill = chip.locator("span").last();
  await expect(pill).toHaveText(/⌘P|Ctrl\+P/);
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)",
  );

  // The wordmark's says what the wordmark does, and leaving hides it.
  await h.page.getByTestId("wordmark-settings-button").hover();
  await expect(chip).toHaveText("Settings");
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

test("the Notes row's pair name themselves, a greyed Undo keeps its name, and the ··· chip stays inside the window", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  await h.page.getByRole("button", { name: "New folder", exact: true }).hover();
  await expect(chip).toHaveText("New folder");
  await h.page.getByRole("button", { name: "Sort", exact: true }).hover();
  await expect(chip).toHaveText("Sort");

  const undo = h.page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await undo.hover();
  await expect(chip).toHaveText(/^Undo(⌘Z|Ctrl\+Z)$/);
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);

  // The ··· sits 10px from the right edge; its chip shifts in rather than clipping.
  // (The row's ··· is a span with the same name; the header's is the button.)
  await h.page.locator("button[aria-label='Note actions']").hover();
  await expect(chip).toHaveText("Note actions");
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
  await search.focus();
  await expect(chip).toHaveText(/^Search notes/, { timeout: TOOLTIP_REST_MS / 2 });
  await h.page.keyboard.press("Escape");
  await expect(chip).toHaveCount(0);
  await expect(search).toBeFocused();
  expect(h.pageErrors).toEqual([]);
});
