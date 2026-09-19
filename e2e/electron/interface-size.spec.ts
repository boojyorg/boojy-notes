/**
 * Interface size: the app's own UI scale (CSS `zoom` on `<html>`, never
 * Chromium's page zoom, which the main process pins at 0). It was
 * keyboard-only until 2026-09-19, with nothing in the app to say it existed,
 * nothing to say what scale you were on, and nothing to say `Cmd+0` was the
 * way back. Settings now carries the control — a menu, not a stepper, because
 * the scale redraws Settings too and a control pressed repeatedly moved out
 * from under the pointer — and a shortcut says what it did.
 *
 * Needs the real app: the scale is written to `<html>` and read back from
 * storage on the next launch.
 */
import { expect, test } from "@playwright/test";
import { MOD, launchApp, sleep } from "./harness";

const scale = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.style.zoom);

async function openSettings(h: Awaited<ReturnType<typeof launchApp>>) {
  await h.page.getByRole("button", { name: "Notes — open Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

test("Settings carries the scale: a menu, a custom value, Reset, and it survives a restart", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const trigger = h.page.getByTestId("ui-scale-value");
    await expect(trigger).toHaveText(/100%/);
    // At the default there is nothing to reset to.
    await expect(h.page.getByRole("button", { name: "Reset" })).toHaveCount(0);

    // A size is chosen from the menu: applied at once, menu closed, app redrawn.
    await trigger.click();
    const menu = h.page.getByRole("menu", { name: "Interface size" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitemradio", { name: /^120%/ }).click();
    await expect(menu).toHaveCount(0);
    expect(await scale(h.page)).toBe("120%");
    await expect(trigger).toHaveText(/120%/);

    // Custom…: a whole percentage the list does not hold, applied on Enter and
    // never while it is being typed.
    await trigger.click();
    await h.page.getByRole("menuitem", { name: "Custom…" }).click();
    const field = h.page.getByTestId("ui-scale-input");
    await field.fill("93");
    expect(await scale(h.page)).toBe("120%");
    await field.press("Enter");
    expect(await scale(h.page)).toBe("93%");
    await expect(trigger).toHaveText(/93%/);

    // The custom value is the one the menu marks.
    await trigger.click();
    await expect(h.page.getByRole("menuitemradio", { checked: true })).toHaveCount(0);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("menu")).toHaveCount(0);
    // Escape closed the menu and left Settings open.
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();

    await h.page.getByRole("button", { name: "Reset" }).click();
    expect(await scale(h.page)).toBe("100%");

    // The scale is a preference: it is still there on the next launch.
    await trigger.click();
    await h.page.getByRole("menuitemradio", { name: /^110%/ }).click();
    await h.restart();
    expect(await scale(h.page)).toBe("110%");
    await openSettings(h);
    await expect(h.page.getByTestId("ui-scale-value")).toHaveText(/110%/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Settings is usable at either end of the range", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const trigger = h.page.getByTestId("ui-scale-value");
    const dialog = h.page.getByRole("dialog", { name: "Settings" });

    for (const size of [200, 50]) {
      await trigger.click();
      await h.page.getByRole("menuitemradio", { name: new RegExp(`^${size}%`) }).click();
      expect(await scale(h.page)).toBe(`${size}%`);
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
      await expect(trigger).toHaveText(new RegExp(`${size}%`));
      await expect(h.page.getByRole("button", { name: "Reset" })).toBeVisible();
    }

    await h.page.getByRole("button", { name: "Reset" }).click();
    expect(await scale(h.page)).toBe("100%");
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
