/**
 * The window appears on its first frame, never before (2026-09-24). Shown at
 * creation, it stood empty in its background colour while the page loaded:
 * the blank canvas people saw at launch. It is created hidden and shown on
 * `ready-to-show`, with a 3 s fallback (`FIRST_PAINT_CAP_MS` in main.js) so a
 * renderer that never paints still leaves a window to see.
 *
 * Only a window that is shown can answer this, and the harness shows it only
 * on CI (or with BOOJY_TEST_HEADED=1): on a desktop it stays hidden so a run
 * never takes over the screen.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("the window is shown by its first frame, not the fallback", async () => {
  test.skip(!process.env.CI && process.env.BOOJY_TEST_HEADED !== "1", "hidden on a desktop");
  const t0 = Date.now();
  const h = await launchApp({ "Welcome.md": "Hello.\n" });
  try {
    // Well inside the fallback's 3 s from the spawn: only ready-to-show gets here.
    const left = Math.max(100, t0 + 2500 - Date.now());
    await expect
      .poll(
        () => h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        { timeout: left },
      )
      .toBe(true);
    // And what it shows on arrival is the app, not an empty page.
    await expect(h.page.getByRole("button", { name: "New note", exact: true })).toBeVisible();
  } finally {
    await h.close();
  }
});
