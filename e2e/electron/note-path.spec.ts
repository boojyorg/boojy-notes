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
import { expandAllFolders, launchApp, MOD, waitForFile, settled, setWidth } from "./harness";

const SUBPIXEL = 0.5;
// Back and Forward stand left of the path in both states; collapsed, after the trio.
const HISTORY_CONTROLS = ["Back", "Forward"];
const LEFT_CONTROLS = ["Toggle sidebar", "Search notes", "New note", ...HISTORY_CONTROLS];

/** The path's box, the pane's box, and the controls either side of the path. */
async function rowGeometry(page: Page, controls: string[]) {
  const path = await page.getByTestId("note-path").boundingBox();
  const pane = await page.locator(".editor-scroll").boundingBox();
  const more = await page.locator("button[aria-label='Note actions']").boundingBox();
  expect(path, "path box").not.toBeNull();
  expect(pane, "pane box").not.toBeNull();
  expect(more, "··· box").not.toBeNull();
  let controlsRight = controls.length === 0 ? pane!.x : 0;
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
    let g = await rowGeometry(h.page, HISTORY_CONTROLS);
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
  // Long enough to be cut at the window's minimum on every platform: the row
  // gained 66px when Undo and Redo left it (2026-09-24).
  const name = "COMP336 Coursework 2 Marking Scheme and Feedback Notes (working draft)";
  const deep = `University/26-27 Semester 1/COMP336 Big Data Analytics/${name}.md`;
  const h = await launchApp({ [deep]: "Body.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote(name);
    await setWidth(h, 1400);
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
    await setWidth(h, WINDOW_MIN_W);
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

/**
 * A fresh note asks for its name: while the caret is in the unnamed field it
 * stands on a neutral ground that hugs the word, the same distance either
 * side of it, clear of a root note's glyph, and there in full the moment the
 * caret lands (faded in, the box filled behind a ground already drawn around
 * it). Named and left, it is the plain label again.
 */
test("an unnamed name under the caret stands on a ground that hugs it evenly, clear of the glyph", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.emulateMedia({ reducedMotion: "no-preference" });
    await h.page.getByRole("button", { name: "New note", exact: true }).click();
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toBeFocused();
    const ground = () =>
      h.page.evaluate(() => {
        const el = document.querySelector("[data-title]") as HTMLElement;
        const s = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        // Each shadow reads `rgb(r, g, b) <x>px 0px 0px <spread>px`.
        const shadows = [
          ...s.boxShadow.matchAll(/(rgba?\([^)]*\)) (-?[\d.]+)px [\d.]+px [\d.]+px ([\d.]+)px/g),
        ];
        const reach = shadows.map((m) => ({ colour: m[1], x: Number(m[2]), spread: Number(m[3]) }));
        const glyph = document
          .querySelector('[data-testid="note-path-root"] svg')
          ?.getBoundingClientRect();
        return {
          background: s.backgroundColor,
          colours: reach.map((r) => r.colour),
          left: box.left + Math.min(0, ...reach.map((r) => r.x - r.spread)),
          right: box.right + Math.max(0, ...reach.map((r) => r.x + r.spread)),
          wordLeft: box.left + Number.parseFloat(s.paddingLeft),
          wordRight: box.right - Number.parseFloat(s.paddingRight),
          glyphRight: glyph?.right ?? null,
        };
      });
    // Read at once, with motion on: the ground does not fade in.
    const g = await ground();
    expect(g.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(g.colours).toEqual([g.background, g.background]);
    expect(g.wordLeft - g.left).toBeCloseTo(10, 1);
    // The field is the placeholder's width rounded up to a whole pixel.
    expect(g.right - g.wordRight).toBeGreaterThanOrEqual(10 - SUBPIXEL);
    expect(g.right - g.wordRight).toBeLessThanOrEqual(11 + SUBPIXEL);
    expect(g.glyphRight, "root glyph").not.toBeNull();
    expect(g.left - g.glyphRight!).toBeGreaterThanOrEqual(4);

    await h.page.keyboard.type("Plan");
    await h.page.keyboard.press("Enter");
    await expect(title).not.toBeFocused();
    await expect
      .poll(async () => {
        const after = await ground();
        return [after.background, after.colours.length];
      })
      .toEqual(["rgba(0, 0, 0, 0)", 0]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/**
 * The note's first line shares a middle with the sidebar's New note row,
 * whatever block opens the note: a heading grows about that line instead of
 * reaching up from a shared baseline, so the grip centred on the first line
 * stands in one place for every note.
 */
test("the first line's middle is level with New note's, for a paragraph, a heading and a to-do", async () => {
  const h = await launchApp({
    "Para.md": "Plain first line.\n",
    "Head.md": "# Heading first\n",
    "Sub.md": "### Smaller heading first\n",
    "Todo.md": "- [ ] To-do first\n",
  });
  try {
    const middles = () =>
      h.page.evaluate(() => {
        const row = [...document.querySelectorAll("button")]
          .find((b) => b.textContent?.trim() === "New note")!
          .getBoundingClientRect();
        const block = document.querySelector("[data-block-id]")!;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        while (text && !text.textContent?.trim()) text = walker.nextNode();
        const range = document.createRange();
        range.selectNodeContents(text!);
        // The glyphs' box is centred in its line, so its middle is the line's.
        const line = range.getClientRects()[0];
        return { row: row.top + row.height / 2, line: line.top + line.height / 2 };
      });
    const firsts = {
      Para: "Plain first line.",
      Head: "Heading first",
      Sub: "Smaller heading first",
      Todo: "To-do first",
    };
    for (const [name, text] of Object.entries(firsts)) {
      await h.openNote(name);
      // The note measured is the one just opened, not the one before it.
      await expect(h.page.locator("[data-block-id]").first()).toContainText(text);
      const { row, line } = await middles();
      // Within a pixel: the column's padding and a face's glyph box each
      // round to the device, by up to half a pixel. Baselines sat 1.6 to 3.2 off.
      expect(Math.abs(line - row), name).toBeLessThanOrEqual(1);
    }
  } finally {
    await h.close();
  }
});
