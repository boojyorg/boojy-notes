/**
 * Windows and Linux: the window has no title bar, and the app's own strip
 * holds the menu's names over the Mac's row (WindowStrip). The strip names
 * the application menu's own top-level menus, the chrome fixed to the
 * window's top stands below it, and the sidebar's grey runs under the names
 * only while the sidebar shows. The Mac has no strip (its lights sit in the
 * sidebar header), so there the one test is that there is none.
 */
import { execFileSync } from "node:child_process";
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
  const more = await h.page.locator("button[aria-label='Note actions']").boundingBox();
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

test("the sidebar's divider runs up through the strip, and dragging it there resizes", async () => {
  test.skip(process.platform === "darwin", "the Mac has no strip");
  const box = (await strip().boundingBox())!;
  const grey = await strip().evaluate(
    (el) => (el.querySelector('[aria-hidden="true"]') as HTMLElement).offsetWidth,
  );
  // The divider's top piece: the col-resize point just right of the grey.
  const x = box.x + grey + 2;
  const y = box.y + box.height / 2;
  expect(
    await h.page.evaluate(
      ([px, py]) => getComputedStyle(document.elementFromPoint(px, py)!).cursor,
      [x, y],
    ),
  ).toBe("col-resize");
  await h.page.mouse.move(x, y);
  await h.page.mouse.down();
  await h.page.mouse.move(x + 60, y, { steps: 5 });
  await h.page.mouse.up();
  await expect
    .poll(() =>
      strip().evaluate(
        (el) => (el.querySelector('[aria-hidden="true"]') as HTMLElement).offsetWidth,
      ),
    )
    .toBeGreaterThan(grey + 40);
});

// A native menu takes the mouse while it is open, so the window never hears
// the pointer cross the strip; the main process watches the real pointer and
// opens the menu under it, as a Windows menu bar does (2026-10-05). The test
// moves the system's pointer itself, as a person's hand would.
test("with a menu open, the pointer moving onto another name opens that menu", async () => {
  test.skip(process.platform !== "win32", "moves the system pointer with Windows Forms");
  const names = strip().getByRole("menuitem");
  const first = names.nth(0);
  const second = names.nth(1);
  const label = (await second.textContent())!;
  const box = (await second.boundingBox())!;
  const content = await h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentBounds(),
  );
  const moveTo = (x: number, y: number) =>
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${Math.round(x)}, ${Math.round(y)})`,
    ]);
  try {
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    moveTo(content.x + box.x + box.width / 2, content.y + box.y + box.height / 2);
    await expect(second).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
    await expect(first).toHaveAttribute("aria-expanded", "false");
  } finally {
    await h.app.evaluate(({ BrowserWindow, Menu }, name) => {
      const menu = Menu.getApplicationMenu()?.items.find((i) => i.label === name)?.submenu;
      menu?.closePopup(BrowserWindow.getAllWindows()[0]);
    }, label);
    moveTo(0, 0);
  }
  await expect(second).toHaveAttribute("aria-expanded", "false");
});
