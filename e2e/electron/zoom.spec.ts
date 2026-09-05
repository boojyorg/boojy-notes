/**
 * Boojy Notes has one zoom system, its own UI scale. Chromium's page zoom is
 * never the baseline: the View menu carries no zoom roles (they took
 * Cmd+Plus/Minus/0 before the renderer saw them), and a page-zoom level that
 * a profile still holds from the days it did is reset on every load, because
 * the native traffic lights never scale with the page and any zoom misaligns
 * them against the wordmark.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("the View menu carries no zoom roles", async () => {
  const h = await launchApp({ "Note.md": "hello\n" });
  try {
    const roles = await h.app.evaluate(({ Menu }) => {
      const out: string[] = [];
      const walk = (items: Electron.MenuItem[]) => {
        for (const it of items) {
          if (it.role) out.push(String(it.role).toLowerCase());
          if (it.submenu) walk(it.submenu.items);
        }
      };
      walk(Menu.getApplicationMenu()?.items ?? []);
      return out;
    });
    expect(roles).not.toContain("zoomin");
    expect(roles).not.toContain("zoomout");
    expect(roles).not.toContain("resetzoom");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a page-zoom level left in the profile is reset on the next launch", async () => {
  const h = await launchApp({ "Note.md": "hello\n" });
  try {
    // What the old View → Zoom In did: Chromium persists this per origin.
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomLevel(1.5);
    });
    const zoomed = await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
    );
    expect(zoomed).toBeCloseTo(1.5);

    await h.restart();

    const after = await h.app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      return { level: wc.getZoomLevel(), factor: wc.getZoomFactor() };
    });
    expect(after.level).toBe(0);
    expect(after.factor).toBe(1);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
