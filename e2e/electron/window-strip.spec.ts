/**
 * Windows and Linux: the window has no title bar, and the app's own strip
 * holds the menu's names over the Mac's row (WindowStrip). The strip names
 * the application menu's own top-level menus, the chrome fixed to the
 * window's top stands below it, and the sidebar's grey runs under the names
 * only while the sidebar shows. The Mac has no strip (its lights sit in the
 * sidebar header), so there the one test is that there is none.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ "Note.md": "Hello.\n" });
  await h.openNote("Note");
});
test.afterEach(async () => {
  await h?.close();
});

const strip = () => h.page.getByTestId("window-strip");

test("the Mac draws no strip", async () => {
  test.skip(process.platform !== "darwin", "the strip is Windows and Linux");
  await expect(strip()).toHaveCount(0);
});

test("the strip names the application menu's own menus, and the chrome stands below it", async () => {
  test.skip(process.platform === "darwin", "the Mac has no strip");
  const labels = await h.app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((i) => i.label),
  );
  await expect(strip().getByRole("menuitem")).toHaveText(labels);
  const bottom = (await strip().boundingBox())!.y + (await strip().boundingBox())!.height;
  const more = await h.page.getByRole("button", { name: "Note actions" }).boundingBox();
  expect(more!.y).toBeGreaterThanOrEqual(bottom);
  // The native menu bar is hidden: the names live in the strip alone.
  expect(
    await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMenuBarVisible(),
    ),
  ).toBe(false);
});

test("the sidebar's grey runs under the menu's names only while the sidebar shows", async () => {
  test.skip(process.platform === "darwin", "the Mac has no strip");
  const grey = () =>
    strip().evaluate((el) => (el.querySelector('[aria-hidden="true"]') as HTMLElement).offsetWidth);
  expect(await grey()).toBeGreaterThan(150);
  await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
  await expect.poll(grey).toBe(0);
});
