/**
 * Interface size: the app's own UI scale (CSS `zoom` on `<html>`, never
 * Chromium's page zoom, which the main process pins at 0). It was
 * keyboard-only until 2026-09-19, with nothing in the app to say it existed,
 * nothing to say what scale you were on, and nothing to say `Cmd+0` was the
 * way back. Settings now carries a stepper whose figure moves at once and
 * whose app moves a beat after the last press, because the scale redraws
 * Settings too and applying per press moved the button out from under the
 * pointer; and a shortcut says what it did.
 *
 * Needs the real app: the scale is written to `<html>` and read back from
 * storage on the next launch.
 */
import { expect, test } from "@playwright/test";
import { MOD, SETTLE_MS, launchApp, sleep } from "./harness";

const scale = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.style.zoom);

async function openSettings(h: Awaited<ReturnType<typeof launchApp>>) {
  await h.page.getByRole("button", { name: "Notes — open Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

test("Settings carries the scale: a stepper that settles, a typed value, Reset, and a restart", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const figure = h.page.getByTestId("ui-scale-value");
    await expect(figure).toHaveText("100%");
    // At the default there is nothing to go back to.
    await expect(h.page.getByRole("button", { name: "Reset" })).toHaveCount(0);

    // A run of presses moves the figure at once and the app once, at the end.
    await h.page.getByRole("button", { name: "Larger" }).click();
    await h.page.getByRole("button", { name: "Larger" }).click();
    await expect(figure).toHaveText("120%");
    expect(await scale(h.page)).toBe("100%");
    await expect.poll(() => scale(h.page), { timeout: 2_000 }).toBe("120%");
    await expect(figure).toHaveText("120%");

    // The figure is a control: a typed percentage the presets do not hold,
    // applied on Enter and never while it is being typed.
    await figure.click();
    const field = h.page.getByTestId("ui-scale-input");
    await field.fill("93");
    expect(await scale(h.page)).toBe("120%");
    await field.press("Enter");
    await expect.poll(() => scale(h.page)).toBe("93%");
    await expect(figure).toHaveText("93%");

    // Escape leaves the scale alone and Settings open.
    await figure.click();
    await h.page.getByTestId("ui-scale-input").fill("150");
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByTestId("ui-scale-input")).toHaveCount(0);
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    expect(await scale(h.page)).toBe("93%");

    // Reset lands at once.
    await h.page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => scale(h.page)).toBe("100%");

    // The scale is a preference: it is still there on the next launch.
    await h.page.getByRole("button", { name: "Larger" }).click();
    await expect.poll(() => scale(h.page), { timeout: 2_000 }).toBe("110%");
    await h.restart();
    expect(await scale(h.page)).toBe("110%");
    await openSettings(h);
    await expect(h.page.getByTestId("ui-scale-value")).toHaveText("110%");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("closing Settings inside the wait applies the press, and a shortcut then lands on top", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);

    // Leaving is not cancelling: a press inside the wait is applied on the way
    // out. (The shell's shortcuts stand down while Settings is open, so the
    // keyboard cannot race the stepper until the dialog has gone.)
    await h.page.getByRole("button", { name: "Larger" }).click();
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
    await expect.poll(() => scale(h.page)).toBe("110%");

    // And a shortcut straight after is what stands: nothing lands on top of it
    // a beat later.
    await h.page.keyboard.press(`${MOD}+0`);
    expect(await scale(h.page)).toBe("100%");
    await sleep(SETTLE_MS);
    expect(await scale(h.page)).toBe("100%");
    await openSettings(h);
    await expect(h.page.getByTestId("ui-scale-value")).toHaveText("100%");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Settings is usable at either end of the range", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const figure = h.page.getByTestId("ui-scale-value");
    const dialog = h.page.getByRole("dialog", { name: "Settings" });

    // The presets, walked to each end: 100 → 200 is six presses, 200 → 50 ten.
    for (const [size, presses, direction] of [
      [200, 6, "Larger"],
      [50, 10, "Smaller"],
    ] as const) {
      for (let i = 0; i < presses; i++)
        await h.page.getByRole("button", { name: direction }).click();
      await expect.poll(() => scale(h.page), { timeout: 3_000 }).toBe(`${size}%`);

      // The pane is still on screen and its controls can still be reached.
      const box = await dialog.boundingBox();
      const window = await h.page.evaluate(() => ({
        w: globalThis.innerWidth,
        h: globalThis.innerHeight,
      }));
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.y).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(window.w + 1);
      }
      await expect(figure).toHaveText(`${size}%`);
      await expect(h.page.getByRole("button", { name: "Reset" })).toBeVisible();
    }

    await h.page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => scale(h.page)).toBe("100%");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a scale shortcut says what it did, the reset included, and goes by itself", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await h.openNote("Note");
    const chip = h.page.getByTestId("ui-scale-chip");

    await h.page.keyboard.press(`${MOD}+=`);
    await expect(chip).toContainText("Interface size 110%");
    // Off 100% it carries the key that goes back, as a key and not as prose.
    await expect(chip).toContainText(MOD === "Meta" ? "⌘0" : "Ctrl+0");
    await expect(chip).toContainText("resets");

    // The reset answers too, and then there is nothing to reset to.
    await h.page.keyboard.press(`${MOD}+0`);
    await expect(chip).toContainText("Interface size 100%");
    await expect(chip).not.toContainText("resets");
    expect(await scale(h.page)).toBe("100%");

    // One beat, then gone.
    await expect(chip).toHaveCount(0, { timeout: 4_000 });

    // A press at the end of the range still answers with the scale it is on:
    // saying nothing there reads as a missed keystroke.
    for (let i = 0; i < 12; i++) await h.page.keyboard.press(`${MOD}+=`);
    await expect(chip).toContainText("Interface size 200%");
    await h.page.keyboard.press(`${MOD}+=`);
    await sleep(100);
    await expect(chip).toContainText("Interface size 200%");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
