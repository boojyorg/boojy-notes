/**
 * The note's path in the chrome row (2026-09-15): `University / Archive /
 * Todd's Note`, centred on the editor pane, its folders giving way before its
 * name as the row runs out of room, and never over a control. Measured in the
 * real app because the fit is measured there: the crumbs' widths come from
 * the DOM, and the position from flex spacers, neither of which jsdom lays
 * out. The clearance is the same on every platform; where the left group
 * starts is not (the traffic lights are macOS's), so every assertion reads
 * the controls' positions rather than assuming them.
 */
import { expect, type Page, test } from "@playwright/test";
import { PATH_AIR } from "../../src/components/EditorChrome";
import { WINDOW_MIN_W } from "../../src/constants/layout";
import { type AppHandle, expandAllFolders, launchApp, MOD, waitForFile } from "./harness";

const SUBPIXEL = 0.5;
const LEFT_CONTROLS = ["Toggle sidebar", "Search notes", "New note", "Undo", "Redo"];

async function settled(page: Page) {
  await page.evaluate(async () => {
    for (let round = 0; round < 10; round++) {
      const running = document.getAnimations();
      if (running.length === 0) return;
      await Promise.allSettled(running.map((a) => a.finished));
    }
  });
}

async function setWidth(h: AppHandle, width: number) {
  await h.app.evaluate(({ BrowserWindow }, w) => {
    BrowserWindow.getAllWindows()[0].setSize(w, 800);
  }, width);
  await expect
    .poll(async () => await h.page.evaluate(() => window.innerWidth), { timeout: 5000 })
    .toBe(width);
  await settled(h.page);
  // The band re-measures itself on the resize; give the frame that paints it.
  await h.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
}

/** The path's box, the pane's box, and the controls either side of the path. */
async function rowGeometry(page: Page, controls: string[]) {
  const path = await page.getByTestId("note-path").boundingBox();
  const pane = await page.locator(".editor-scroll").boundingBox();
  const more = await page.locator("button[aria-label='Note actions']").boundingBox();
  expect(path, "path box").not.toBeNull();
  expect(pane, "pane box").not.toBeNull();
  expect(more, "··· box").not.toBeNull();
  let controlsRight = 0;
  for (const title of controls) {
    const box = await page.locator(`[aria-label='${title}']:not([inert] *)`).boundingBox();
    expect(box, `${title} box`).not.toBeNull();
    controlsRight = Math.max(controlsRight, box!.x + box!.width);
  }
  return {
    left: path!.x,
    right: path!.x + path!.width,
    centre: path!.x + path!.width / 2,
    paneCentre: pane!.x + pane!.width / 2,
    controlsRight,
    moreLeft: more!.x,
  };
}

const folders = (page: Page) => page.getByTestId("note-path-folder").allTextContents();
const ellipses = (page: Page) => page.getByTestId("note-path-ellipsis").count();
/** Whether the name's own text is cut (text-overflow), rather than shown whole. */
const nameCut = (page: Page) =>
  page
    .getByRole("textbox", { name: "Note title" })
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);

const NOTE = "University/Archive/Todd's Note.md";

test("the path shows the note's folders before its name, centred on the pane, in both states", async () => {
  const h = await launchApp({ [NOTE]: "Alpha.\n", "Job Application.md": "Root.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await setWidth(h, 1200);

    // Expanded: every folder, no ellipsis, and the whole thing on the pane's centre.
    expect(await folders(h.page)).toEqual(["University", "Archive"]);
    expect(await ellipses(h.page)).toBe(0);
    let g = await rowGeometry(h.page, ["Undo", "Redo"]);
    expect(Math.abs(g.centre - g.paneCentre)).toBeLessThanOrEqual(1);
    expect(g.left).toBeGreaterThanOrEqual(g.controlsRight + PATH_AIR - SUBPIXEL);
    expect(g.right).toBeLessThanOrEqual(g.moreLeft - PATH_AIR + SUBPIXEL);

    // Collapsed: the same path, still on the pane's centre (the pane is the window now).
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();
    expect(await folders(h.page)).toEqual(["University", "Archive"]);
    g = await rowGeometry(h.page, LEFT_CONTROLS);
    expect(Math.abs(g.centre - g.paneCentre)).toBeLessThanOrEqual(1);
    expect(g.left).toBeGreaterThanOrEqual(g.controlsRight + PATH_AIR - SUBPIXEL);

    // A root note is its name alone: no folder, no ellipsis, no `Notes /`.
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await h.openNote("Job Application");
    expect(await folders(h.page)).toEqual([]);
    expect(await ellipses(h.page)).toBe(0);
    await expect(h.page.getByTestId("note-path")).toHaveText("Job Application");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("narrowing the window drops the outer folders first and never puts the path over a control", async () => {
  const h = await launchApp({ [NOTE]: "Alpha.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await setWidth(h, 1200);
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();

    // Continuously, not at a few fixed widths: every 20px from wide to the minimum.
    let shownBefore = Number.POSITIVE_INFINITY;
    let leftBefore = Number.POSITIVE_INFINITY;
    for (let width = 1200; width >= WINDOW_MIN_W; width -= 20) {
      await setWidth(h, width);
      const kept = await folders(h.page);
      const dots = await ellipses(h.page);
      const shown = kept.length + (dots ? 0.5 : 0);
      // Never more path than the wider window had; when a folder goes, the
      // outer one goes first, so what is kept is a suffix of the path.
      expect(shown, `path at ${width}`).toBeLessThanOrEqual(shownBefore);
      expect(kept, `suffix at ${width}`).toEqual(["University", "Archive"].slice(2 - kept.length));
      // A folder is only ever shown beside the whole name.
      if (kept.length > 0 || dots > 0)
        await expect.poll(() => nameCut(h.page), { message: `name at ${width}` }).toBe(false);
      // Clear of the controls on both sides, always.
      const g = await rowGeometry(h.page, LEFT_CONTROLS);
      expect(g.left, `left at ${width}`).toBeGreaterThanOrEqual(
        g.controlsRight + PATH_AIR - SUBPIXEL,
      );
      expect(g.right, `right at ${width}`).toBeLessThanOrEqual(g.moreLeft - PATH_AIR + SUBPIXEL);
      // On the pane's centre when there is room there, and only ever nudged
      // right of it (toward the band) when there is not: never left of it.
      expect(g.centre, `centre at ${width}`).toBeGreaterThanOrEqual(g.paneCentre - 1);
      // With the same crumbs as the wider window, the left edge never travels
      // right as the window narrows: centred it follows the pane's centre
      // leftward, pinned it stays with the controls. (When a folder goes the
      // path narrows and its left edge steps right; that is the text changing,
      // not the position, and is the one move allowed.)
      if (shown === shownBefore) {
        expect(g.left, `no jump at ${width}`).toBeLessThanOrEqual(leftBefore + SUBPIXEL);
      }
      shownBefore = shown;
      leftBefore = g.left;
    }
    // At the minimum the nearest folder is still there, and the name whole: on
    // macOS the band is 219px (the window minimum follows the sidebar's, 545
    // since 2026-09-16; it was 190px in a 520 window, where only `… / Archive /
    // Todd's Note` fitted, and the whole path fits now).
    await setWidth(h, WINDOW_MIN_W);
    if (process.platform === "darwin") {
      const kept = await folders(h.page);
      expect(kept[kept.length - 1]).toBe("Archive");
      expect(await nameCut(h.page)).toBe(false);
    }
    // Widening gives the whole path back.
    await setWidth(h, 1200);
    expect(await folders(h.page)).toEqual(["University", "Archive"]);
    expect(await ellipses(h.page)).toBe(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a long name in a deep folder gives up its folders before a letter of itself", async () => {
  const name = "COMP336 Coursework 2 Marking Scheme (working draft)";
  const deep = `University/26-27 Semester 1/COMP336 Big Data Analytics/${name}.md`;
  const h = await launchApp({ [deep]: "Body.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote(name);
    await setWidth(h, 1200);
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();
    // Wide: the whole path.
    expect(await folders(h.page)).toHaveLength(3);
    expect(await nameCut(h.page)).toBe(false);

    // Medium: some folders have gone, the name has not lost a letter.
    await setWidth(h, 900);
    const kept = await folders(h.page);
    expect(kept.length).toBeLessThan(3);
    expect(await ellipses(h.page)).toBe(1);
    expect(await nameCut(h.page)).toBe(false);
    const g = await rowGeometry(h.page, LEFT_CONTROLS);
    expect(g.left).toBeGreaterThanOrEqual(g.controlsRight + PATH_AIR - SUBPIXEL);
    expect(g.right).toBeLessThanOrEqual(g.moreLeft - PATH_AIR + SUBPIXEL);

    // Narrow: no folder is left to give, so the name itself is cut, inside the band.
    await setWidth(h, 600);
    expect(await folders(h.page)).toEqual([]);
    expect(await ellipses(h.page)).toBe(0);
    expect(await nameCut(h.page)).toBe(true);
    const n = await rowGeometry(h.page, LEFT_CONTROLS);
    expect(n.left).toBeGreaterThanOrEqual(n.controlsRight + PATH_AIR - SUBPIXEL);
    expect(n.right).toBeLessThanOrEqual(n.moreLeft - PATH_AIR + SUBPIXEL);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a click on the name still renames the file in place, folders untouched", async () => {
  const h = await launchApp({ [NOTE]: "Alpha.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await title.click();
    await expect(title).toBeFocused();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Todd's Plan");
    await waitForFile(h.vault.file("University/Archive/Todd's Plan.md"), (t) => t === "Alpha.\n", {
      label: "renamed file in its folder",
    });
    // The old file goes after the new one is written; under load the unlink
    // can land a beat later than the write, so wait for it rather than assume.
    await expect.poll(() => h.vault.exists(NOTE), { timeout: 4000 }).toBe(false);
    // The path still says where it is; the name is the field's, which stays focused.
    expect(await folders(h.page)).toEqual(["University", "Archive"]);
    await expect(title).toBeFocused();
    // Enter leaves the name for the first block, as it always did.
    await h.page.keyboard.press("Enter");
    await expect(title).not.toBeFocused();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
