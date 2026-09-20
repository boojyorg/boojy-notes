/**
 * Moving a note or folder without the sidebar's drag (2026-09-20): Move to…
 * in the note, folder, editor-header and bulk menus opens the path popup as
 * a folders-only picker; and the path's popup itself takes the sidebar's
 * press-and-hold drag. Proven in the real app because a move is a file
 * relocation on disk (a note's `.md`, a folder's directory), because the
 * active note keeps its pending edits across the move and they must reach
 * the new path, and because the drag's geometry (hold, targets, fly-back) is
 * measured there.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { editorTitle, expandAllFolders, launchApp, MOD, sleep, waitForFile } from "./harness";

const FILES: Record<string, string> = {
  "University/Archive/Todd's Note.md": "Alpha.\n",
  "University/Archive/Old plan.md": "Old.\n",
  "University/Archive/2024/Exam notes.md": "Exam.\n",
  "University/Semester 1/Week 1.md": "Week.\n",
  "University/Timetable.md": "Time.\n",
  "Personal/Diary.md": "Diary.\n",
  "Ideas.md": "Ideas.\n",
};

const picker = (page: Page) => page.getByTestId("move-picker");
const popup = (page: Page) => page.getByTestId("path-tree");
const crumb = (page: Page, name: string) =>
  page.getByTestId("note-path-folder").filter({ hasText: name });
const pathFolders = (page: Page) => page.getByTestId("note-path-folder").allTextContents();
const noteRow = (page: Page, title: string) =>
  page.locator("[data-note-id]").filter({ hasText: title }).first();
const folderRow = (page: Page, path: string) =>
  page.locator(`[data-folder-path="${path}"]`).first();
const pickRow = (page: Page, folder: string) =>
  picker(page).locator(`[data-pick-folder="${folder}"]`);
/** The picker's rows top to bottom, folders marked open (▾) or closed (▸), disabled (×), current (✓). */
const pickerRows = (page: Page) =>
  picker(page)
    .locator('[role="treeitem"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const open = el.getAttribute("aria-expanded");
        const mark = open === null ? "" : open === "true" ? "▾ " : "▸ ";
        const dis = el.getAttribute("aria-disabled") === "true" ? "× " : "";
        const cur = el.getAttribute("aria-current") ? " ✓" : "";
        const name = el.querySelector("span")?.textContent?.trim();
        return `${dis}${mark}${name}${cur}`;
      }),
    );
const highlighted = (page: Page, dialog = picker(page)) =>
  dialog.evaluate((el) => {
    const id = el.querySelector('[role="tree"]')?.getAttribute("aria-activedescendant");
    return id ? (document.getElementById(id) as HTMLElement).innerText.trim() : null;
  });
const menu = (page: Page) => page.getByRole("menu");
const menuItem = (page: Page, label: string) => menu(page).getByRole("menuitem", { name: label });
const sidebarToggle = (page: Page) => page.locator("[aria-label='Toggle sidebar']:not([inert] *)");
const expandedFolders = (page: Page) =>
  page
    .locator('[data-folder-path][aria-expanded="true"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-folder-path")));

/** A press held on a row, moved onto `to`, released — or moved and left there for the caller. */
async function holdAndDrag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("holdAndDrag: row not visible");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await sleep(600);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await sleep(100);
}

test("Move to… from a note's menu: the picker ticks where it is, Right expands, Enter moves; the sidebar reveals the destination and pending edits follow", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    // A pending edit: typed, not yet on disk, and the move must not lose it.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("End");
    await h.page.keyboard.type(" Moved.");

    await noteRow(h.page, "Todd's Note").click({ button: "right" });
    await expect(menu(h.page).getByRole("menuitem")).toHaveText([
      "Rename",
      "Duplicate",
      "Move to…",
      "Delete",
    ]);
    await menuItem(h.page, "Move to…").click();
    await expect(menu(h.page)).toHaveCount(0);
    await expect(picker(h.page)).toBeVisible();
    await expect(picker(h.page)).toHaveAttribute("aria-label", "Move “Todd's Note” to");
    // Folders only, the root first, the path to the current folder open,
    // the current folder ticked and highlighted.
    expect(await pickerRows(h.page)).toEqual([
      "▾ Notes",
      "Personal",
      "▾ University",
      "▾ Archive ✓",
      "2024",
      "Semester 1",
    ]);
    expect(await highlighted(h.page)).toBe("Archive");
    expect(await picker(h.page).locator("[data-note-id]").count()).toBe(0);

    // Expanding is not choosing: the chevron opens Archive's sibling, the
    // keys walk, Right on a closed folder opens it, Enter chooses.
    await folderChevron(h.page, "University/Archive").click();
    await expect.poll(() => pickerRows(h.page)).not.toContain("2024");
    await expect(picker(h.page)).toBeVisible();
    await h.page.keyboard.press("ArrowDown");
    expect(await highlighted(h.page)).toBe("Semester 1");
    await h.page.keyboard.press("ArrowUp");
    await h.page.keyboard.press("ArrowRight");
    await expect.poll(() => pickerRows(h.page)).toContain("2024");
    await expect(picker(h.page)).toBeVisible();
    await h.page.keyboard.press("ArrowDown");
    expect(await highlighted(h.page)).toBe("2024");
    await h.page.keyboard.press("Enter");
    await expect(picker(h.page)).toHaveCount(0);

    // The file moved, with the edit; the note stayed open; the path follows.
    await waitForFile(h.vault.file("University/Archive/2024/Todd's Note.md"), (c) =>
      c.includes("Alpha. Moved."),
    );
    await expect.poll(() => h.vault.exists("University/Archive/Todd's Note.md")).toBe(false);
    expect(await editorTitle(h.page)).toBe("Todd's Note");
    expect(await pathFolders(h.page)).toEqual(["University", "Archive", "2024"]);
    // The sidebar shows where it went: the row lit for a beat, under an open folder.
    const landed = h.page.locator("[data-note-id].is-new");
    await expect(landed).toHaveText("Todd's Note");
    expect(await folderRow(h.page, "University/Archive/2024").getAttribute("aria-expanded")).toBe(
      "true",
    );
    await expect(landed).toHaveCount(0, { timeout: 5000 });
  } finally {
    await h.close();
  }
});

const folderChevron = (page: Page, path: string) => pickRow(page, path).getByTestId("pick-chevron");

test("Move to… from the editor's ··· with the sidebar hidden: the root is a destination, the path updates and the sidebar stays hidden", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await sidebarToggle(h.page).click();
    await expect(h.page.locator(".sidebar-action-row")).toBeHidden();

    await h.page.locator("button[aria-label='Note actions']").click();
    await expect(menu(h.page).getByRole("menuitem")).toHaveText([
      "Rename",
      "Duplicate",
      "Move to…",
      "Delete",
      "Settings",
    ]);
    await menuItem(h.page, "Move to…").click();
    await expect(picker(h.page)).toBeVisible();
    // Choosing the ticked row does nothing but close.
    await pickRow(h.page, "University/Archive").click();
    await expect(picker(h.page)).toHaveCount(0);
    await sleep(300);
    expect(h.vault.exists("University/Archive/Todd's Note.md")).toBe(true);

    await h.page.locator("button[aria-label='Note actions']").click();
    await menuItem(h.page, "Move to…").click();
    await pickRow(h.page, "").click();
    await expect(picker(h.page)).toHaveCount(0);
    await waitForFile(h.vault.file("Todd's Note.md"), (c) => c.includes("Alpha."));
    await expect.poll(() => h.vault.exists("University/Archive/Todd's Note.md")).toBe(false);
    expect(await pathFolders(h.page)).toEqual([]);
    expect(await editorTitle(h.page)).toBe("Todd's Note");
    // The sidebar was not reopened for it.
    await expect(h.page.locator(".sidebar-action-row")).toBeHidden();
    await expect(sidebarToggle(h.page)).toBeVisible();
  } finally {
    await h.close();
  }
});

test("a bulk selection spanning two folders ticks nothing; the move takes every note", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await noteRow(h.page, "Diary").click({ modifiers: [MOD] });
    await noteRow(h.page, "Timetable").click({ modifiers: [MOD] });
    await noteRow(h.page, "Timetable").click({ button: "right" });
    await expect(menu(h.page).getByRole("menuitem")).toHaveText(["Move to…", "Delete 2 notes"]);
    await menuItem(h.page, "Move to…").click();
    await expect(picker(h.page)).toHaveAttribute("aria-label", "Move 2 notes to");
    expect(await picker(h.page).locator("[aria-current]").count()).toBe(0);
    expect(await pickerRows(h.page)).toEqual(["▾ Notes", "Personal", "▸ University"]);
    expect(await highlighted(h.page)).toBe("Notes");
    await pickRow(h.page, "Personal").click();
    await waitForFile(h.vault.file("Personal/Timetable.md"), (c) => c.includes("Time."));
    expect(h.vault.exists("Personal/Diary.md")).toBe(true);
    await expect.poll(() => h.vault.exists("University/Timetable.md")).toBe(false);
    // Both rows are lit; only the one that moved changed place.
    await expect(h.page.locator("[data-note-id].is-new")).toHaveText(["Timetable"]);
  } finally {
    await h.close();
  }
});

test("a folder's Move to… disables the folder and everything inside it, and moves the directory", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await folderRow(h.page, "University").click({ button: "right" });
    await expect(menu(h.page).getByRole("menuitem")).toHaveText([
      "New note",
      "New folder",
      "Rename",
      "Duplicate folder",
      "Move to…",
      "Delete folder",
    ]);
    await menuItem(h.page, "Move to…").click();
    await expect(picker(h.page)).toHaveAttribute("aria-label", "Move “University” to");
    expect(await pickerRows(h.page)).toEqual(["▾ Notes ✓", "Personal", "× University"]);
    // The disabled row takes no click and no Enter (forced: Playwright itself
    // refuses to click an aria-disabled element).
    await pickRow(h.page, "University").click({ force: true });
    await expect(picker(h.page)).toBeVisible();
    await h.page.keyboard.press("End");
    await h.page.keyboard.press("Enter");
    await expect(picker(h.page)).toBeVisible();
    expect(h.vault.exists("University/Timetable.md")).toBe(true);

    await pickRow(h.page, "Personal").click();
    await expect(picker(h.page)).toHaveCount(0);
    await expect
      .poll(() => h.vault.exists("Personal/University/Archive/2024/Exam notes.md"), {
        timeout: 5000,
      })
      .toBe(true);
    await expect.poll(() => h.vault.exists("University")).toBe(false);
    await expect(h.page.locator("[data-folder-path].is-new")).toHaveAttribute(
      "data-folder-path",
      "Personal/University",
    );
    expect(await expandedFolders(h.page)).toContain("Personal");

    // And back to the root from the nested place.
    await folderRow(h.page, "Personal/University/Archive").click({ button: "right" });
    await menuItem(h.page, "Move to…").click();
    expect(await pickerRows(h.page)).toEqual([
      "▾ Notes",
      "▾ Personal",
      "▾ University ✓",
      "× Archive",
      "Semester 1",
    ]);
    await pickRow(h.page, "").click();
    await expect.poll(() => h.vault.exists("Archive/Todd's Note.md"), { timeout: 5000 }).toBe(true);
    await expect.poll(() => h.vault.exists("Personal/University/Archive")).toBe(false);
  } finally {
    await h.close();
  }
});

test("Escape closes the picker and moves nothing; a click outside closes it too", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Todd's Note");
    await noteRow(h.page, "Todd's Note").click({ button: "right" });
    await menuItem(h.page, "Move to…").click();
    await expect(picker(h.page)).toBeVisible();
    await h.page.keyboard.press("ArrowUp");
    await h.page.keyboard.press("Escape");
    await expect(picker(h.page)).toHaveCount(0);
    await noteRow(h.page, "Todd's Note").click({ button: "right" });
    await menuItem(h.page, "Move to…").click();
    await h.page.locator("[data-block-id]").first().click();
    await expect(picker(h.page)).toHaveCount(0);
    await sleep(300);
    expect(h.vault.exists("University/Archive/Todd's Note.md")).toBe(true);
    expect(await editorTitle(h.page)).toBe("Todd's Note");
  } finally {
    await h.close();
  }
});

test("a row in the path's popup drags onto a folder row there; a folder too; a release elsewhere or Escape cancels", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Old plan");
    await sidebarToggle(h.page).click();
    await expect(h.page.locator(".sidebar-action-row")).toBeHidden();
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("End");
    await h.page.keyboard.type(" Dragged.");

    // University's contents, Archive open: drag Todd's Note onto Semester 1.
    await crumb(h.page, "Archive").click();
    await expect(popup(h.page)).toBeVisible();
    const popupNote = popup(h.page).locator("[data-note-id]").filter({ hasText: "Todd's Note" });
    const semester = popup(h.page).locator('[data-folder-path="University/Semester 1"]');
    await holdAndDrag(h.page, popupNote, semester);
    // The target is painted while the pointer is on it.
    expect(await semester.evaluate((el) => el.style.boxShadow)).toContain("inset");
    await h.page.mouse.up();
    await waitForFile(h.vault.file("University/Semester 1/Todd's Note.md"), (c) =>
      c.includes("Alpha."),
    );
    await expect.poll(() => h.vault.exists("University/Archive/Todd's Note.md")).toBe(false);
    // An ordinary click still navigates: the popup is open, the open note unchanged.
    await expect(popup(h.page)).toBeVisible();
    expect(await editorTitle(h.page)).toBe("Old plan");
    expect(await pathFolders(h.page)).toEqual(["University", "Archive"]);

    // The open note itself, pending edit and all, dragged onto 2024.
    const popupOpen = popup(h.page).locator("[data-note-id]").filter({ hasText: "Old plan" });
    await holdAndDrag(
      h.page,
      popupOpen,
      popup(h.page).locator('[data-folder-path="University/Archive/2024"]'),
    );
    await h.page.mouse.up();
    await waitForFile(h.vault.file("University/Archive/2024/Old plan.md"), (c) =>
      c.includes("Old. Dragged."),
    );
    expect(await editorTitle(h.page)).toBe("Old plan");
    await expect.poll(() => pathFolders(h.page)).toEqual(["University", "Archive", "2024"]);

    // A release over no folder row (the empty space under the rows) flies
    // back and moves nothing; so does Escape mid-drag.
    const popupSem = popup(h.page).locator('[data-folder-path="University/Semester 1"]');
    const box = (await popup(h.page).boundingBox())!;
    await holdAndDrag(h.page, popupSem, popup(h.page));
    await h.page.mouse.move(box.x + 20, box.y + box.height - 4);
    await sleep(100);
    await h.page.mouse.up();
    await sleep(400);
    expect(h.vault.exists("University/Semester 1/Week 1.md")).toBe(true);
    await holdAndDrag(
      h.page,
      popupSem,
      popup(h.page).locator('[data-folder-path="University/Archive"]'),
    );
    await h.page.keyboard.press("Escape");
    await expect(popup(h.page)).toBeVisible();
    await h.page.mouse.up();
    await sleep(400);
    expect(h.vault.exists("University/Semester 1/Week 1.md")).toBe(true);
    expect(
      await h.page.locator("body").evaluate((b) => b.classList.contains("block-dragging")),
    ).toBe(false);

    // A folder onto a folder: Semester 1 into Archive, the directory moves.
    await holdAndDrag(
      h.page,
      popupSem,
      popup(h.page).locator('[data-folder-path="University/Archive"]'),
    );
    await h.page.mouse.up();
    await expect
      .poll(() => h.vault.exists("University/Archive/Semester 1/Week 1.md"), { timeout: 5000 })
      .toBe(true);
    // A folder onto itself or its own subtree is no target.
    await popup(h.page).locator('[data-folder-path="University/Archive/Semester 1"]').waitFor();
    // Bring the sidebar back: the destinations the drags revealed are open there.
    await sidebarToggle(h.page).click();
    await expect(h.page.locator(".sidebar-action-row")).toBeVisible();
    expect(await expandedFolders(h.page)).toEqual(
      expect.arrayContaining(["University", "University/Archive"]),
    );
  } finally {
    await h.close();
  }
});
