/**
 * The chrome row's chips: the app's own tooltip under a control, naming it
 * with its shortcut, in place of the browser's `title` tooltip. Needs the real
 * window: the rest timer, the hover and the chip's place against the window's
 * edge are what is being proved.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const TOOLTIP_REST_MS = 400;

test("a chrome control names itself under the pointer, shortcut included, with no native title", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  // None of the row's controls carries a `title`: the chip is the one tooltip
  // (the tree's hover-revealed row controls still do; judged separately).
  for (const name of ["Collapse sidebar", "Search notes", "Undo", "Redo"]) {
    const control = h.page.getByRole("button", { name, exact: true });
    await expect(control, name).not.toHaveAttribute("title", /.*/);
  }
  await expect(h.page.getByTestId("wordmark-settings-button")).not.toHaveAttribute("title", /.*/);
  await expect(h.page.locator("button[aria-label='Note actions']")).not.toHaveAttribute(
    "title",
    /.*/,
  );

  const toggle = h.page.getByRole("button", { name: "Collapse sidebar", exact: true });
  await toggle.hover();
  await expect(chip).toHaveText("Collapse sidebar");
  const toggleBox = (await toggle.boundingBox())!;
  const chipBox = (await chip.boundingBox())!;
  // Under the control, centred on it.
  expect(chipBox.y).toBeGreaterThan(toggleBox.y + toggleBox.height);
  expect(
    Math.abs(chipBox.x + chipBox.width / 2 - (toggleBox.x + toggleBox.width / 2)),
  ).toBeLessThan(2);

  // The shortcut sits beside the name in muted ink.
  await h.page.getByRole("button", { name: "Search notes", exact: true }).hover();
  await expect(chip).toHaveText(/^Search notes(⌘P|Ctrl\+P)$/);

  // A press hides it, and the wordmark's says what the wordmark does.
  await h.page.getByTestId("wordmark-settings-button").hover();
  await expect(chip).toHaveText("Settings");
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

test("a disabled history button says why, and the ··· chip stays inside the window", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");

  const undo = h.page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  await undo.hover();
  await expect(chip).toHaveText("Nothing to undo");
  await h.page.mouse.move(400, 300);
  await expect(chip).toHaveCount(0);

  // The ··· sits 10px from the right edge; its chip shifts in rather than clipping.
  // The row's ··· is a span with the same name; the header's is the button.
  await h.page.locator("button[aria-label='Note actions']").hover();
  await expect(chip).toHaveText("Note actions");
  const box = (await chip.boundingBox())!;
  const width = await h.page.evaluate(() => window.innerWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(width - 8 + 0.5);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(h.pageErrors).toEqual([]);
});

test("keyboard focus shows the chip at once, and activating hides it", async () => {
  h = await launchApp({ "Alpha.md": "Alpha starts here.\n" });
  await h.openNote("Alpha");
  const chip = h.page.getByTestId("chrome-tooltip");
  const search = h.page.getByRole("button", { name: "Search notes", exact: true });
  await search.focus();
  await expect(chip).toHaveText(/^Search notes/, { timeout: TOOLTIP_REST_MS / 2 });
  await h.page.keyboard.press("Escape");
  await expect(chip).toHaveCount(0);
  await expect(search).toBeFocused();
  expect(h.pageErrors).toEqual([]);
});
