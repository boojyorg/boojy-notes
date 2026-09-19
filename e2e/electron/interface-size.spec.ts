/**
 * Interface size: the app's own UI scale (CSS `zoom` on `<html>`, never
 * Chromium's page zoom, which the main process pins at 0). It was
 * keyboard-only until 2026-09-19, with nothing in the app to say it existed,
 * nothing to say what scale you were on, and nothing to say `Cmd+0` was the
 * way back. Settings now carries the control and a shortcut says what it did.
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

test("Settings carries the scale: it steps, it resets, and it survives a restart", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await openSettings(h);
    const value = h.page.getByTestId("ui-scale-value");
    await expect(value).toHaveText("100%");
    // At 100% there is nothing to reset to.
    await expect(h.page.getByRole("button", { name: "Reset" })).toHaveCount(0);

    await h.page.getByRole("button", { name: "Larger" }).click();
    await expect(value).toHaveText("110%");
    expect(await scale(h.page)).toBe("110%");
    await h.page.getByRole("button", { name: "Smaller" }).click();
    await expect(value).toHaveText("100%");

    // Two steps up, then back in one press.
    await h.page.getByRole("button", { name: "Larger" }).click();
    await h.page.getByRole("button", { name: "Larger" }).click();
    await expect(value).toHaveText("120%");
    await h.page.getByRole("button", { name: "Reset" }).click();
    await expect(value).toHaveText("100%");
    expect(await scale(h.page)).toBe("100%");

    // The scale is a preference: it is still there on the next launch.
    await h.page.getByRole("button", { name: "Larger" }).click();
    await expect(value).toHaveText("110%");
    await h.restart();
    expect(await scale(h.page)).toBe("110%");
    await openSettings(h);
    await expect(h.page.getByTestId("ui-scale-value")).toHaveText("110%");
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
