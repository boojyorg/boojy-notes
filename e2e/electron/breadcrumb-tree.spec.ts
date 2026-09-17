/**
 * The path's folder popup (2026-09-16): a folder crumb in `University /
 * Archive / Todd's Note` opens the sidebar's tree drawn small under it,
 * scoped to that folder's parent with the path to the open note expanded, so
 * the notes near the open one can be reached with the sidebar hidden. Proven
 * in the real app because the popup's placement is measured there (the
 * crumb's rect, the viewport clamp), and because opening a note from it
 * crosses the text-commit and write debounces: a keystroke still pending when
 * another note is chosen must reach the first note's file.
 */
import { expect, type Page, test } from "@playwright/test";
import { WINDOW_MIN_W } from "../../src/constants/layout";
import {
  type AppHandle,
  editorTitle,
  expandAllFolders,
  launchApp,
  MOD,
  waitForFile,
} from "./harness";

const NOTE = "University/Archive/Todd's Note.md";
const FILES: Record<string, string> = {
  [NOTE]: "Alpha.\n",
  "University/Archive/Old plan.md": "Old.\n",
  "University/Archive/2024/Exam notes.md": "Exam.\n",
  "University/Semester 1/Week 1.md": "Week.\n",
  "University/Timetable.md": "Time.\n",
  "Personal/Diary.md": "Diary.\n",
  "Ideas.md": "Ideas.\n",
};

const popup = (page: Page) => page.getByTestId("path-tree");
const crumb = (page: Page, name: string) =>
  page.getByTestId("note-path-folder").filter({ hasText: name });
/** Every row of the popup, top to bottom, folders marked open (▾) or closed (▸). */
const popupRows = (page: Page) =>
  popup(page)
    .locator('[role="treeitem"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const open = el.getAttribute("aria-expanded");
        const mark = open === null ? "" : open === "true" ? "▾ " : "▸ ";
        return `${mark}${(el as HTMLElement).innerText.trim()}`;
      }),
    );
const pathFolders = (page: Page) => page.getByTestId("note-path-folder").allTextContents();
const highlighted = (page: Page) =>
  popup(page).evaluate((el) => {
    const id = el.querySelector('[role="tree"]')?.getAttribute("aria-activedescendant");
    return id ? (document.getElementById(id) as HTMLElement).innerText.trim() : null;
  });
/** The popup's box, checked against the window it must stay inside. */
async function expectInsideViewport(page: Page) {
  const box = await popup(page).boundingBox();
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.w);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.h);
  return box!;
}

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
  await h.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
}

test("a folder crumb opens its parent's contents, the path expanded and the open note checked; the path stays put", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await setWidth(h, 1200);
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);

    // Archive: University's contents, Archive open, Todd's Note marked.
    await crumb(h.page, "Archive").click();
    await expect(popup(h.page)).toBeVisible();
    expect(await popupRows(h.page)).toEqual([
      "▾ Archive",
      "▸ 2024",
      "Old plan",
      "Todd's Note",
      "▸ Semester 1",
      "Timetable",
    ]);
    await expect(popup(h.page).locator('[aria-current="true"]')).toHaveText("Todd's Note");
    expect(await highlighted(h.page)).toBe("Todd's Note");
    // The open note is the sidebar's active row: a pill, no check, no ring.
    const openRow = popup(h.page).locator('[aria-current="true"]');
    expect(await openRow.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(await openRow.locator("svg").count()).toBe(0);
    expect(await openRow.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
    expect(await crumb(h.page, "Archive").getAttribute("aria-expanded")).toBe("true");
    // It hangs under the crumb, left edges aligned, 280 wide.
    const anchor = await crumb(h.page, "Archive").boundingBox();
    const box = await expectInsideViewport(h.page);
    expect(box.width).toBe(280);
    expect(Math.abs(box.x - anchor!.x)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThan(anchor!.y + anchor!.height);
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);

    // A folder row opens and closes in place (the rows slide, so poll); the
    // path is untouched.
    await popup(h.page).getByText("Semester 1").click();
    await expect.poll(() => popupRows(h.page)).toContain("Week 1");
    await popup(h.page).getByText("Semester 1").click();
    await expect.poll(() => popupRows(h.page)).not.toContain("Week 1");
    await popup(h.page).getByText("2024").click();
    await expect.poll(() => popupRows(h.page)).toContain("Exam notes");
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);
    expect(await editorTitle(h.page)).toBe("Todd's Note");

    // A click outside closes it and still lands: the sidebar toggle both
    // closes the popup and hides the sidebar in one press. And expansion
    // starts fresh next time.
    await h.page.locator("[aria-label='Collapse sidebar']").click();
    await expect(popup(h.page)).toHaveCount(0);
    await expect(h.page.locator("[aria-label='Expand sidebar']")).toBeVisible();
    await h.page.locator("[aria-label='Expand sidebar']").click();
    await expect(h.page.locator("[aria-label='Collapse sidebar']:not([inert] *)")).toBeVisible();
    await crumb(h.page, "Archive").click();
    await expect(popup(h.page)).toBeVisible();
    // The open crumb's own click closes it.
    await crumb(h.page, "Archive").click();
    await expect(popup(h.page)).toHaveCount(0);
    await crumb(h.page, "Archive").click();
    expect(await popupRows(h.page)).toEqual([
      "▾ Archive",
      "▸ 2024",
      "Old plan",
      "Todd's Note",
      "▸ Semester 1",
      "Timetable",
    ]);
    await h.page.keyboard.press("Escape");
    await expect(popup(h.page)).toHaveCount(0);

    // University: the root, University and Archive open, the root note last,
    // and still no `Notes /` in the path.
    await crumb(h.page, "University").click();
    expect(await popupRows(h.page)).toEqual([
      "▸ Personal",
      "▾ University",
      "▾ Archive",
      "▸ 2024",
      "Old plan",
      "Todd's Note",
      "▸ Semester 1",
      "Timetable",
      "Ideas",
    ]);
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);
    await expect(popup(h.page).getByRole("tree")).toHaveAccessibleName("Notes");
    await h.page.keyboard.press("Escape");

    // The name is not a crumb: one click still edits it, and opens nothing.
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await expect(popup(h.page)).toHaveCount(0);
    expect(await h.page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(
      "Note title",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note chosen in the popup replaces the open one and closes it; the path becomes the new note's", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await crumb(h.page, "Archive").click();
    await popup(h.page).getByText("Old plan").click();
    await expect(popup(h.page)).toHaveCount(0);
    await expect.poll(() => editorTitle(h.page)).toBe("Old plan");
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);

    // Into another folder, from the root scope.
    await crumb(h.page, "University").click();
    await popup(h.page).getByText("Semester 1").click();
    await expect.poll(() => popupRows(h.page)).toContain("Week 1");
    await popup(h.page).getByText("Week 1").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Week 1");
    expect(await pathFolders(h.page)).toEqual(["University", "Semester 1"]);

    // A root note: name alone, no crumb, and the folder glyph in the crumb's
    // slot opens the root with nothing expanded and the note on its pill.
    await crumb(h.page, "University").click();
    await popup(h.page).getByText("Ideas").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Ideas");
    expect(await pathFolders(h.page)).toEqual([]);
    await expect(h.page.getByTestId("note-path-ellipsis")).toHaveCount(0);
    const glyph = h.page.getByTestId("note-path-root");
    await expect(glyph).toBeVisible();
    const glyphBox = await glyph.boundingBox();
    const field = h.page.getByRole("textbox", { name: "Note title" });
    const nameBox = await field.boundingBox();
    // Before the name's text (the field's own side padding may overlap the box).
    const textLeft =
      nameBox!.x + (await field.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)));
    expect(glyphBox!.x + glyphBox!.width).toBeLessThanOrEqual(textLeft + 1);
    await glyph.click();
    await expect(popup(h.page)).toBeVisible();
    expect(await popupRows(h.page)).toEqual(["▸ Personal", "▸ University", "Ideas"]);
    await expect(popup(h.page).locator('[aria-current="true"]')).toHaveText("Ideas");
    await expect(popup(h.page).getByRole("tree")).toHaveAccessibleName("Notes");
    // Hovering the glyph opens nothing; a click on it closes what it opened.
    await glyph.click();
    await expect(popup(h.page)).toHaveCount(0);
    await glyph.hover();
    await expect(popup(h.page)).toHaveCount(0);
    // And from there, back into a folder.
    await glyph.click();
    await popup(h.page).getByText("University").click();
    await expect.poll(() => popupRows(h.page)).toContain("Timetable");
    await popup(h.page).getByText("Timetable").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Timetable");
    await expect(h.page.getByTestId("note-path-root")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the keys walk the tree; Escape returns focus to the crumb; the shell's shortcuts stay quiet", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await crumb(h.page, "Archive").click();
    expect(await highlighted(h.page)).toBe("Todd's Note");
    await h.page.keyboard.press("ArrowDown");
    expect(await highlighted(h.page)).toBe("Semester 1");
    // A key moved the highlight: it carries the ring; the open note keeps its pill.
    const rowShadow = (text: string) =>
      popup(h.page)
        .locator('[role="treeitem"]')
        .filter({ hasText: text })
        .first()
        .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(await rowShadow("Semester 1")).not.toBe("none");
    expect(await rowShadow("Todd's Note")).toBe("none");
    await h.page.keyboard.press("ArrowRight");
    await expect.poll(() => popupRows(h.page)).toContain("Week 1");
    expect(await highlighted(h.page)).toBe("Semester 1");
    await h.page.keyboard.press("ArrowRight");
    expect(await highlighted(h.page)).toBe("Week 1");
    await h.page.keyboard.press("ArrowLeft");
    expect(await highlighted(h.page)).toBe("Semester 1");
    await h.page.keyboard.press("ArrowLeft");
    await expect.poll(() => popupRows(h.page)).not.toContain("Week 1");
    await h.page.keyboard.press("ArrowUp");
    await h.page.keyboard.press("ArrowUp");
    expect(await highlighted(h.page)).toBe("Old plan");

    // Cmd+N over the popup makes nothing: the popup owns the keys.
    await h.page.keyboard.press(`${MOD}+n`);
    await expect(popup(h.page)).toBeVisible();
    expect(await editorTitle(h.page)).toBe("Todd's Note");

    await h.page.keyboard.press("Escape");
    await expect(popup(h.page)).toHaveCount(0);
    expect(
      await h.page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return `${el?.dataset.testid}:${el?.textContent}`;
      }),
    ).toBe("note-path-folder:Archive");
    expect(await editorTitle(h.page)).toBe("Todd's Note");

    // Enter on a highlighted note opens it.
    await crumb(h.page, "Archive").click();
    await h.page.keyboard.press("ArrowUp");
    expect(await highlighted(h.page)).toBe("Old plan");
    await h.page.keyboard.press("Enter");
    await expect(popup(h.page)).toHaveCount(0);
    await expect.poll(() => editorTitle(h.page)).toBe("Old plan");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("hidden folders: the ellipsis opens the root with the path expanded, inside a narrow window", async () => {
  const h = await launchApp(FILES, {
    prepare: (vault) => {
      // Enough notes in Archive that the popup must scroll, with the open note
      // newest so it sorts first among them (Most recent is the default).
      for (let i = 1; i <= 15; i++) vault.write(`University/Archive/Note ${i}.md`, `N${i}.\n`);
      const base = Date.now() - 60_000;
      for (const f of vault.list()) vault.setMtime(f, base);
      vault.setMtime(NOTE, base + 30_000);
    },
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await setWidth(h, WINDOW_MIN_W);
    await expect(h.page.getByTestId("note-path-ellipsis")).toHaveCount(1);

    await h.page.getByTestId("note-path-ellipsis").click();
    await expect(popup(h.page)).toBeVisible();
    const rows = await popupRows(h.page);
    expect(rows.slice(0, 5)).toEqual([
      "▸ Personal",
      "▾ University",
      "▾ Archive",
      "▸ 2024",
      "Todd's Note",
    ]);
    expect(rows).toContain("Note 15");
    expect(rows.at(-1)).toBe("Ideas");
    await expect(popup(h.page).locator('[aria-current="true"]')).toHaveText("Todd's Note");
    // Clamped inside the narrow window, and scrolling inside itself rather
    // than growing past the twelve-row cap; the clicked path's folders stay
    // in view above the open note.
    const box = await expectInsideViewport(h.page);
    expect(box.width).toBe(280);
    const scroller = await popup(h.page)
      .getByRole("tree")
      .evaluate((el) => ({
        scrollTop: el.scrollTop,
        scrolls: el.scrollHeight > el.clientHeight,
      }));
    expect(scroller.scrolls).toBe(true);
    expect(scroller.scrollTop).toBe(0);
    const uni = await popup(h.page).getByText("University").boundingBox();
    expect(uni!.y).toBeGreaterThanOrEqual(box.y);

    // A note deep in the list opens from here too.
    await popup(h.page).getByText("Note 15").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Note 15");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a keystroke still pending when another note is chosen reaches the first note's file", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("End");
    await h.page.keyboard.type(" Beta");
    // Straight on, inside the text-commit and write debounces.
    await crumb(h.page, "Archive").click();
    await popup(h.page).getByText("Old plan").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Old plan");
    await waitForFile(h.vault.file(NOTE), (t) => t === "Alpha. Beta\n", {
      label: "the pending keystrokes to reach Todd's Note.md",
    });
    expect(h.vault.read("University/Archive/Old plan.md")).toBe("Old.\n");

    // And back, through the popup, to the text as written.
    await crumb(h.page, "Archive").click();
    await popup(h.page).getByText("Todd's Note").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Todd's Note");
    await expect(h.page.locator("[data-block-id]").first()).toHaveText("Alpha. Beta");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("at a UI scale above 100% the popup still lands under the crumb", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await h.page.keyboard.press(`${MOD}+=`);
    await h.page.keyboard.press(`${MOD}+=`);
    const zoom = await h.page.evaluate(
      () => (document.documentElement as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom,
    );
    expect(zoom).toBeGreaterThan(1);
    await crumb(h.page, "Archive").click();
    await expect(popup(h.page)).toBeVisible();
    // Both boxes are read in viewport pixels: the popup's left edge is the
    // crumb's, and it is 280 of the page's own pixels wide, scaled once.
    const anchor = await crumb(h.page, "Archive").boundingBox();
    const box = await expectInsideViewport(h.page);
    expect(Math.abs(box.x - anchor!.x)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThan(anchor!.y + anchor!.height);
    expect(box.y - (anchor!.y + anchor!.height)).toBeLessThan(12 * zoom!);
    expect(Math.abs(box.width - 280 * zoom!)).toBeLessThanOrEqual(1);
    await popup(h.page).getByText("Old plan").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Old plan");
    await h.page.keyboard.press(`${MOD}+0`);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
