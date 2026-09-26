/**
 * The editor header's controls: the sidebar/Search/New note trio that appears
 * only while the sidebar is away, and the ··· menu that always offers
 * Settings. Undo and Redo were header buttons until 2026-09-24 and are Edit →
 * Undo and Redo now; the history tests drive those items.
 *
 * Needs the real app: the proof of a history command is the Markdown on disk
 * once the write debounce has settled, and the proof of "one visible control
 * each" is what the rendered window actually holds in each sidebar state.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  type AppHandle,
  expectNoTempFiles,
  launchApp,
  menuClick,
  menuEnabled,
  noteText,
  sleep,
  waitForFile,
} from "./harness";

const A = "Alpha.md";
const B = "Beta.md";
const A_TEXT = "Alpha starts here.";
const B_TEXT = "Beta starts here.";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const hideSidebar = () => h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();

test("Edit → Undo and Redo take back the open note's edits, and the file follows", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");

  // Nothing has been edited in this note, so neither item offers anything.
  await expect.poll(() => menuEnabled(h, "undo")).toBe(false);
  await expect.poll(() => menuEnabled(h, "redo")).toBe(false);

  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "typing to save" });
  await expect.poll(() => menuEnabled(h, "undo")).toBe(true);

  await menuClick(h, "undo");
  await waitForFile(h.vault.file(A), (t) => !t.includes(" edited"), { label: "undo to save" });
  expect(await noteText(h.page)).toBe(A_TEXT);
  await expect.poll(() => menuEnabled(h, "redo")).toBe(true);

  await menuClick(h, "redo");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "redo to save" });
  expect(await noteText(h.page)).toBe(`${A_TEXT} edited`);

  // Typing carries on in the note: the menu never took the caret out of it.
  // (Where a restore leaves the caret is history's own long-standing rule and
  // is not changed here, so the test puts it at the end first.)
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" more");
  await waitForFile(h.vault.file(A), (t) => t.includes(" more"), { label: "typing after redo" });
  expect(await noteText(h.page)).toBe(`${A_TEXT} edited more`);
  expectNoTempFiles(h.vault);
});

test("Edit → Undo changes the open note and leaves the other note's file alone", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n`, [B]: `${B_TEXT}\n` });
  await h.openNote("Alpha");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "Alpha to save" });

  // Beta has nothing of its own to undo, and Alpha's entry is not Beta's.
  await h.openNote("Beta");
  await expect.poll(() => menuEnabled(h, "undo")).toBe(false);
  await sleep(SETTLE_MS);
  expect(h.vault.read(A).trimEnd()).toBe(`${A_TEXT} edited`);
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);

  await h.openNote("Alpha");
  await expect.poll(() => menuEnabled(h, "undo")).toBe(true);
  await menuClick(h, "undo");
  await waitForFile(h.vault.file(A), (t) => !t.includes(" edited"), {
    label: "Alpha undo to save",
  });
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);

  // History is the session's; the files are what survives a restart.
  await h.restart();
  await h.openNote("Alpha");
  await expect.poll(() => menuEnabled(h, "undo")).toBe(false);
  expect(await noteText(h.page)).toBe(A_TEXT);
  expectNoTempFiles(h.vault);
});

test("exactly one Search, New note and sidebar toggle is exposed in each sidebar state", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");

  /**
   * Controls a user can actually reach, by accessible name. A collapsed
   * sidebar keeps its DOM — drag hit-tests and scroll position survive it —
   * so presence proves nothing; what matters is that its copies are inside an
   * `inert` subtree, out of the tab order and out of the accessibility tree.
   */
  const exposed = (name: string) =>
    h.page.evaluate(
      (n) =>
        Array.from(document.querySelectorAll("button, [role='button']"))
          .filter((el) => !el.closest("[inert]"))
          .filter((el) => (el.getAttribute("aria-label") || el.textContent?.trim()) === n).length,
      name,
    );

  // Expanded: the sidebar owns navigation and creation; the header carries the
  // note's ··· alone. Undo and Redo are the menu bar's (2026-09-24).
  for (const name of ["Search notes", "New note", "Toggle sidebar", "New folder", "Sort"]) {
    expect(await exposed(name), name).toBe(1);
  }
  for (const name of ["Undo", "Redo"]) {
    expect(await exposed(name), name).toBe(0);
  }

  await hideSidebar();

  // Collapsed: the header takes the trio over, still one of each.
  for (const name of ["Search notes", "New note", "Toggle sidebar"]) {
    expect(await exposed(name), name).toBe(1);
  }
  for (const name of ["New folder", "Sort", "Undo", "Redo"]) {
    expect(await exposed(name), name).toBe(0);
  }

  // A narrow window changes nothing about ownership: the sidebar shown again
  // there is the same in-layout panel and owns the trio exactly as wide.
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(700, 800);
  });
  await expect.poll(() => h.page.evaluate(() => window.innerWidth)).toBe(700);
  await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
  await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();
  for (const name of ["Search notes", "New note", "Toggle sidebar", "New folder", "Sort"]) {
    expect(await exposed(name), `narrow: ${name}`).toBe(1);
  }
});

test("the collapsed header's New note and Search are the sidebar's own actions", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");
  await hideSidebar();

  await h.page.locator("[aria-label='Search notes']:not([inert] *)").click();
  await expect(h.page.getByPlaceholder(/search/i)).toBeVisible();
  // Opening Search does not bring the sidebar back.
  await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();
  await h.page.keyboard.press("Escape");

  await h.page.locator("[aria-label='New note']:not([inert] *)").click();
  await expect(h.page.getByRole("textbox", { name: "Note title" })).toBeFocused();
  await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();
});

test("Settings is in the header menu, with a note open and with none", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");

  await h.page.locator("button[aria-label='Note actions']").click();
  const menu = h.page.getByRole("menu", { name: "Note actions" });
  await expect(menu).toBeVisible();
  // The note's length closes its own menu: "Alpha starts here." is three
  // words. One muted line, never an item.
  await expect(menu.getByTestId("note-stats")).toHaveText("3 words");
  expect(await menu.getByRole("menuitem").allTextContents()).toEqual([
    "Rename",
    "Duplicate",
    "Move to…",
    expect.stringMatching(/^Version History/),
    "Delete",
    // The view item carries its shortcut (⌘/ on a Mac, Ctrl+/ elsewhere).
    expect.stringMatching(/^Show Markdown/),
    "Settings",
  ]);
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);

  // An empty library: nothing has been edited, so Undo and Redo are greyed,
  // and Settings is still one click away.
  await h.close();
  h = await launchApp({});
  await expect.poll(() => menuEnabled(h, "undo")).toBe(false);
  await expect.poll(() => menuEnabled(h, "redo")).toBe(false);
  await h.page.locator("button[aria-label='Note actions']").click();
  await expect(h.page.getByRole("menu").getByRole("menuitem", { name: "Settings" })).toBeVisible();
  // The desktop always has a note open (an empty library opens a draft), so
  // the counts are there and honest.
  await expect(h.page.getByRole("menu").getByTestId("note-stats")).toHaveText("0 words");
  await h.page.getByRole("menu").getByRole("menuitem", { name: "Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});
