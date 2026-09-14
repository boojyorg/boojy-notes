/**
 * The chrome row's controls and the note's name share one line, and the name
 * starts past the last of them — whatever the window width, and in either
 * sidebar state. Review H12 found the reserve measured from the web inset, so
 * on macOS the toggle was drawn over the first letters at 1,200px and at 700px
 * alike; since 2026-09-12 there are up to five controls in front of the name
 * rather than one, and the reserve must clear all of them. This spec is a real
 * guard on macOS and a plain layout check elsewhere.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

/** The chrome buttons that sit left of the note's name, in DOM order. */
const LEFT_CONTROLS = ["Show sidebar", "Search notes", "New note", "Undo", "Redo"];

async function setWidth(h: AppHandle, width: number) {
  await h.app.evaluate(({ BrowserWindow }, w) => {
    BrowserWindow.getAllWindows()[0].setSize(w, 800);
  }, width);
  await expect
    .poll(async () => await h.page.evaluate(() => window.innerWidth), { timeout: 5000 })
    .toBe(width);
}

/** The right edge of the rightmost chrome control on the title's row. */
async function controlsRight(page: Page, titles: string[]) {
  let right = 0;
  let mid = 0;
  for (const title of titles) {
    const box = await page.locator(`[title='${title}']:not([inert] *)`).boundingBox();
    expect(box, `${title} box`).not.toBeNull();
    if (box!.x + box!.width > right) {
      right = box!.x + box!.width;
      mid = box!.y + box!.height / 2;
    }
  }
  return { right, mid };
}

test("the chrome row's controls never overlap the note's name, wide or narrow", async () => {
  // 600px is the window's minimum (electron/main.js).
  const h = await launchApp({ "Link end.md": "Alpha.\n" });
  try {
    await h.openNote("Link end");
    const title = h.page.getByRole("textbox", { name: "Note title" });

    // Expanded: the history pair is the only thing in front of the name, at
    // every width, since the sidebar stays in the layout at the minimum too.
    for (const width of [1200, 600]) {
      await setWidth(h, width);
      const { right, mid } = await controlsRight(h.page, ["Undo", "Redo"]);
      const n = await title.boundingBox();
      expect(n, `title box, expanded at ${width}`).not.toBeNull();
      expect(n!.x, `title left, expanded at ${width}`).toBeGreaterThanOrEqual(right + 8);
      expect(mid).toBeGreaterThan(n!.y);
      expect(mid).toBeLessThan(n!.y + n!.height);
      // The name still has room to read in, and stays clear of the ··· .
      const more = await h.page.locator("button[title='Note actions']").boundingBox();
      expect(n!.x + n!.width, `title right, expanded at ${width}`).toBeLessThanOrEqual(more!.x);
    }
    await setWidth(h, 1200);

    await h.page.getByTitle("Hide sidebar").click();
    await expect(h.page.getByTitle("Show sidebar")).toBeVisible();

    // Collapsed: five controls, and the name still starts past the last.
    for (const width of [1200, 700, 600]) {
      await setWidth(h, width);
      const { right, mid } = await controlsRight(h.page, LEFT_CONTROLS);
      const n = await title.boundingBox();
      expect(n, `title box at ${width}`).not.toBeNull();
      expect(n!.x, `title left at ${width}, collapsed`).toBeGreaterThanOrEqual(right + 8);
      // Same row: the controls' centre falls within the label's line box, and
      // nothing has wrapped to a second line.
      expect(mid).toBeGreaterThan(n!.y);
      expect(mid).toBeLessThan(n!.y + n!.height);
      // The name still has room to read in, and stays clear of the ··· .
      const more = await h.page.locator("button[title='Note actions']").boundingBox();
      expect(n!.x + n!.width, `title right at ${width}`).toBeLessThanOrEqual(more!.x);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a very long name yields to the controls rather than covering them", async () => {
  const long = "A note with a deliberately and extravagantly long file name for this test";
  const h = await launchApp({ [`${long}.md`]: "Alpha.\n" });
  try {
    await h.openNote(long);
    await h.page.getByTitle("Hide sidebar").click();
    await setWidth(h, 600);
    const { right } = await controlsRight(h.page, LEFT_CONTROLS);
    const n = await h.page.getByRole("textbox", { name: "Note title" }).boundingBox();
    const more = await h.page.locator("button[title='Note actions']").boundingBox();
    expect(n!.x).toBeGreaterThanOrEqual(right + 8);
    expect(n!.x + n!.width).toBeLessThanOrEqual(more!.x);
    // Truncated, not wrapped: one line box, the height of the label's row.
    expect(n!.height).toBeLessThan(30);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/**
 * macOS full screen hides the traffic lights, so the inset that clears them
 * (86px in front of the wordmark expanded, and of the whole left group
 * collapsed) was dead space there, and the note's name sat a long way right
 * for nothing (2026-09-14). Both fall back to the ordinary inset while full
 * screen is on and return when it ends. Only macOS has the lights, so this is
 * a macOS-only guard; elsewhere the inset never applies.
 */
test("full screen drops the traffic-light inset and leaving it brings it back", async () => {
  test.skip(process.platform !== "darwin", "the traffic lights are macOS's");
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  const setFullScreen = (on: boolean) =>
    h.app.evaluate(({ BrowserWindow }, v) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(v);
    }, on);
  const leftOf = async (title: string) => (await h.page.getByTitle(title).boundingBox())!.x;
  try {
    await h.openNote("Alpha");
    await setWidth(h, 1200);
    const wordmark = h.page.getByTitle("Open Settings");
    const atRest = (await wordmark.boundingBox())!.x;
    expect(atRest).toBe(86);

    // Expanded: the wordmark moves back to the header's own inset...
    await setFullScreen(true);
    await expect.poll(() => leftOf("Open Settings"), { timeout: 10000 }).toBeLessThan(40);
    // ...and collapsed, the group starts at the web inset with the name past it.
    await h.page.getByTitle("Hide sidebar").click();
    await expect.poll(() => leftOf("Show sidebar")).toBe(10);
    const { right } = await controlsRight(h.page, LEFT_CONTROLS);
    const n = await h.page.getByRole("textbox", { name: "Note title" }).boundingBox();
    expect(n!.x).toBeGreaterThanOrEqual(right + 8);
    // No drag strip either: nothing to drag in full screen.
    await expect(h.page.getByTestId("window-drag-strip")).toHaveCount(0);

    // Leaving full screen restores the inset in both states.
    await setFullScreen(false);
    await expect.poll(() => leftOf("Show sidebar"), { timeout: 10000 }).toBe(86);
    await expect(h.page.getByTestId("window-drag-strip")).toHaveCount(1);
    await h.page.getByTitle("Show sidebar").click();
    await expect.poll(() => leftOf("Open Settings")).toBe(atRest);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await setFullScreen(false).catch(() => {});
    await h.close();
  }
});
