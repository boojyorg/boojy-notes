/**
 * Interface size: the app's own UI scale (CSS `zoom` on `<html>`, never
 * Chromium's page zoom, which the main process pins at 0). It was
 * keyboard-only until 2026-09-19, with nothing in the app to say it existed,
 * nothing to say what scale you were on, and nothing to say `Cmd+0` was the
 * way back. Settings now carries a stepper that applies at once, and the pane
 * itself keeps the size and place it opened with while the app resizes behind
 * it — a panel that grows as you press the button inside it moves that button
 * out from under the pointer (judged live twice, Tyr). A shortcut says what it
 * did, and the scale keys are the one shortcut that works over Settings.
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

test("the stepper applies at once, takes a typed value, and resets", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const figure = h.page.getByTestId("ui-scale-value");
    await expect(figure).toHaveText("100%");
    await expect(h.page.getByRole("button", { name: "Reset" })).toHaveCount(0);

    // Every press lands as it is made — no timer, nothing pending.
    await h.page.getByRole("button", { name: "Larger" }).click();
    expect(await scale(h.page)).toBe("110%");
    await h.page.getByRole("button", { name: "Larger" }).click();
    expect(await scale(h.page)).toBe("120%");
    await expect(figure).toHaveText("120%");

    // The figure is a control: a typed percentage the presets do not hold,
    // applied on Enter and never while it is being typed.
    await figure.click();
    const field = h.page.getByTestId("ui-scale-input");
    await field.fill("93");
    expect(await scale(h.page)).toBe("120%");
    await field.press("Enter");
    expect(await scale(h.page)).toBe("93%");
    await expect(figure).toHaveText("93%");

    // Leaving the field commits it too.
    await figure.click();
    await h.page.getByTestId("ui-scale-input").fill("125");
    await h.page.getByTestId("ui-scale-input").press("Tab");
    await expect.poll(() => scale(h.page)).toBe("125%");

    // Escape leaves the scale alone and Settings open.
    await figure.click();
    await h.page.getByTestId("ui-scale-input").fill("60");
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByTestId("ui-scale-input")).toHaveCount(0);
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    expect(await scale(h.page)).toBe("125%");

    await h.page.getByRole("button", { name: "Reset" }).click();
    expect(await scale(h.page)).toBe("100%");

    // The scale is a preference: it is still there on the next launch.
    await h.page.getByRole("button", { name: "Larger" }).click();
    await h.restart();
    expect(await scale(h.page)).toBe("110%");
    await openSettings(h);
    await expect(h.page.getByTestId("ui-scale-value")).toHaveText("110%");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the pane holds its size and place while the app resizes behind it", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const pane = h.page.getByRole("dialog", { name: "Settings" });
    const sidebarWidth = () =>
      h.page.evaluate(
        () => (document.querySelector("[role=tree]") as HTMLElement).getBoundingClientRect().width,
      );
    const before = await pane.boundingBox();
    const sidebarBefore = await sidebarWidth();

    // Six presses to 200%: the app grows under every one of them, the pane
    // does not move at all.
    for (let i = 0; i < 6; i++) {
      await h.page.getByRole("button", { name: "Larger" }).click();
      const box = await pane.boundingBox();
      expect(box?.x).toBeCloseTo(before?.x ?? 0, 0);
      expect(box?.y).toBeCloseTo(before?.y ?? 0, 0);
      expect(box?.width).toBeCloseTo(before?.width ?? 0, 0);
    }
    expect(await scale(h.page)).toBe("200%");
    expect(await sidebarWidth()).toBeGreaterThan(sidebarBefore * 1.9);

    // Reopening is drawn at the scale of the day.
    await h.page.keyboard.press("Escape");
    await openSettings(h);
    const reopened = await pane.boundingBox();
    expect(reopened?.width ?? 0).toBeCloseTo((before?.width ?? 0) * 2, 0);

    // The same holds going the other way, and the pane stays on screen.
    for (let i = 0; i < 10; i++) await h.page.getByRole("button", { name: "Smaller" }).click();
    expect(await scale(h.page)).toBe("50%");
    const small = await pane.boundingBox();
    expect(small?.width).toBeCloseTo(reopened?.width ?? 0, 0);
    const win = await h.page.evaluate(() => ({
      w: globalThis.innerWidth,
      h: globalThis.innerHeight,
    }));
    expect(small?.x).toBeGreaterThanOrEqual(-1);
    expect(small?.y).toBeGreaterThanOrEqual(-1);
    expect((small?.x ?? 0) + (small?.width ?? 0)).toBeLessThanOrEqual(win.w + 1);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("opened at 50%, 100% and 200%: the pane fits the window and its controls work", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    for (const size of [50, 200, 100]) {
      // Set the scale with the keyboard, from outside Settings.
      await h.page.keyboard.press(`${MOD}+0`);
      const steps = size === 50 ? 5 : size === 200 ? 6 : 0;
      const key = size === 50 ? `${MOD}+-` : `${MOD}+=`;
      for (let i = 0; i < steps; i++) await h.page.keyboard.press(key);
      expect(await scale(h.page)).toBe(`${size}%`);

      await openSettings(h);
      const pane = h.page.getByRole("dialog", { name: "Settings" });
      const box = await pane.boundingBox();
      const win = await h.page.evaluate(() => ({
        w: globalThis.innerWidth,
        h: globalThis.innerHeight,
      }));
      expect(box?.x).toBeGreaterThanOrEqual(-1);
      expect(box?.y).toBeGreaterThanOrEqual(-1);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(win.w + 1);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(win.h + 1);
      // Opened at that scale, the pane carries no zoom of its own.
      expect(await pane.evaluate((el) => (el as HTMLElement).style.zoom)).toBe("");
      await expect(h.page.getByTestId("ui-scale-value")).toHaveText(`${size}%`);

      // Its controls still work at that size: the theme pills and the chip on
      // the notes-folder path, which is portalled out of the pane.
      await h.page.getByRole("radio", { name: "Dark" }).click();
      await expect(h.page.getByRole("radio", { name: "Dark" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await h.page.getByTestId("notes-folder-path").hover();
      await expect(h.page.getByTestId("path-tooltip")).toBeVisible({ timeout: 3_000 });
      const chip = await h.page.getByTestId("path-tooltip").boundingBox();
      const anchor = await h.page.getByTestId("notes-folder-path").boundingBox();
      // The chip is drawn at the app's scale, under the control it names.
      expect(Math.abs((chip?.x ?? 0) - (anchor?.x ?? 0))).toBeLessThan((box?.width ?? 0) / 2);
      expect(chip?.y ?? 0).toBeGreaterThan(anchor?.y ?? 0);

      // Keyboard focus still lands inside the pane.
      await h.page.keyboard.press("Tab");
      expect(
        await h.page.evaluate(() =>
          document.querySelector("[data-settings-pane]")?.contains(document.activeElement),
        ),
      ).toBe(true);
      await h.page.getByRole("radio", { name: "Light" }).click();
      await h.page.keyboard.press("Escape");
      await expect(pane).toHaveCount(0);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the window can be resized while Settings is open, at any scale", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    for (let i = 0; i < 4; i++) await h.page.getByRole("button", { name: "Larger" }).click();
    expect(await scale(h.page)).toBe("150%");

    const pane = h.page.getByRole("dialog", { name: "Settings" });
    for (const [w, hh] of [
      [900, 620],
      [1400, 900],
    ] as const) {
      await h.app.evaluate(
        async ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]);
        },
        [w, hh],
      );
      await sleep(300);
      const box = await pane.boundingBox();
      const win = await h.page.evaluate(() => ({
        w: globalThis.innerWidth,
        h: globalThis.innerHeight,
      }));
      // Still centred and still inside the window it now has.
      expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBeCloseTo(win.w / 2, 0);
      expect(box?.y).toBeGreaterThanOrEqual(-1);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(win.h + 1);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the scale keys work over Settings, and the chip stands down there", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const figure = h.page.getByTestId("ui-scale-value");

    // The one shortcut Settings does not stand in front of: the row follows it,
    // and the floating readout stays away because the row says the number.
    await h.page.keyboard.press(`${MOD}+=`);
    expect(await scale(h.page)).toBe("110%");
    await expect(figure).toHaveText("110%");
    await expect(h.page.getByTestId("ui-scale-chip")).toHaveCount(0);

    // An unfinished typed value cannot land on top of a shortcut.
    await figure.click();
    await h.page.getByTestId("ui-scale-input").fill("77");
    await h.page.keyboard.press(`${MOD}+0`);
    expect(await scale(h.page)).toBe("100%");
    await expect(h.page.getByTestId("ui-scale-input")).toHaveCount(0);
    await expect(figure).toHaveText("100%");
    await sleep(SETTLE_MS);
    expect(await scale(h.page)).toBe("100%");

    // Every other shortcut still stands down over the pane.
    await h.page.keyboard.press(`${MOD}+n`);
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();

    // Outside Settings the chip comes back.
    await h.page.keyboard.press("Escape");
    await h.page.keyboard.press(`${MOD}+=`);
    await expect(h.page.getByTestId("ui-scale-chip")).toBeVisible();
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
