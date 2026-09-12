/**
 * The editor header's controls: Undo and Redo for the open note, the
 * sidebar/Search/New note trio that appears only while the sidebar is away,
 * and the ··· menu that always offers Settings.
 *
 * Needs the real app: the proof of a history button is the Markdown on disk
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

const hideSidebar = () => h.page.getByTitle("Hide sidebar").click();

test("the buttons undo and redo the open note, and the file follows", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");
  const undo = h.page.getByTitle("Undo");
  const redo = h.page.getByTitle("Redo");

  // Nothing has been edited in this note, so neither button offers anything.
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "typing to save" });
  await expect(undo).toBeEnabled();

  await undo.click();
  await waitForFile(h.vault.file(A), (t) => !t.includes(" edited"), { label: "undo to save" });
  expect(await noteText(h.page)).toBe(A_TEXT);
  await expect(redo).toBeEnabled();

  await redo.click();
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "redo to save" });
  expect(await noteText(h.page)).toBe(`${A_TEXT} edited`);

  // Typing carries on in the note: the press never took the caret out of it.
  // (Where a restore leaves the caret is history's own long-standing rule and
  // is not changed here, so the test puts it at the end first.)
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" more");
  await waitForFile(h.vault.file(A), (t) => t.includes(" more"), { label: "typing after redo" });
  expect(await noteText(h.page)).toBe(`${A_TEXT} edited more`);
  expectNoTempFiles(h.vault);
});

test("a button press changes the open note and leaves the other note's file alone", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n`, [B]: `${B_TEXT}\n` });
  await h.openNote("Alpha");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "Alpha to save" });

  // Beta has nothing of its own to undo, and Alpha's entry is not Beta's.
  await h.openNote("Beta");
  await expect(h.page.getByTitle("Undo")).toBeDisabled();
  await sleep(SETTLE_MS);
  expect(h.vault.read(A).trimEnd()).toBe(`${A_TEXT} edited`);
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);

  await h.openNote("Alpha");
  await expect(h.page.getByTitle("Undo")).toBeEnabled();
  await h.page.getByTitle("Undo").click();
  await waitForFile(h.vault.file(A), (t) => !t.includes(" edited"), {
    label: "Alpha undo to save",
  });
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);

  // History is the session's; the files are what survives a restart.
  await h.restart();
  await h.openNote("Alpha");
  await expect(h.page.getByTitle("Undo")).toBeDisabled();
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
  // note's history and its ··· .
  for (const name of ["Search notes", "New note", "Hide sidebar", "New folder", "List options"]) {
    expect(await exposed(name), name).toBe(1);
  }
  expect(await exposed("Show sidebar")).toBe(0);
  for (const name of ["Undo", "Redo"]) {
    expect(await exposed(name), name).toBe(1);
  }

  await hideSidebar();

  // Collapsed: the header takes the trio over, still one of each.
  for (const name of ["Search notes", "New note", "Show sidebar", "Undo", "Redo"]) {
    expect(await exposed(name), name).toBe(1);
  }
  for (const name of ["Hide sidebar", "New folder", "List options"]) {
    expect(await exposed(name), name).toBe(0);
  }

  // Narrow enough that the sidebar can only float over the editor: an open
  // overlay is a showing sidebar, so it owns the trio exactly as in flow.
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(700, 800);
  });
  await expect.poll(() => h.page.evaluate(() => window.innerWidth)).toBe(700);
  await h.page.locator("[title='Show sidebar']:not([inert] *)").click();
  await expect(h.page.getByTitle("Hide sidebar")).toBeVisible();
  for (const name of ["Search notes", "New note", "Hide sidebar", "New folder", "List options"]) {
    expect(await exposed(name), `overlay: ${name}`).toBe(1);
  }
  expect(await exposed("Show sidebar")).toBe(0);
  expect(await exposed("Undo")).toBe(1);
});

test("the collapsed header's New note and Search are the sidebar's own actions", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");
  await hideSidebar();

  await h.page.locator("[title='Search notes']:not([inert] *)").click();
  await expect(h.page.getByPlaceholder(/search/i)).toBeVisible();
  // Opening Search does not bring the sidebar back.
  await expect(h.page.getByTitle("Show sidebar")).toBeVisible();
  await h.page.keyboard.press("Escape");

  await h.page.locator("[title='New note']:not([inert] *)").click();
  await expect(h.page.getByRole("textbox", { name: "Note title" })).toBeFocused();
  await expect(h.page.getByTitle("Show sidebar")).toBeVisible();
});

test("Settings is in the header menu, with a note open and with none", async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n` });
  await h.openNote("Alpha");

  await h.page.locator("button[title='Note actions']").click();
  const menu = h.page.getByRole("menu", { name: "Note actions" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);

  // An empty library: nothing has been edited, so both history buttons are
  // inactive, and Settings is still one click away.
  await h.close();
  h = await launchApp({});
  await expect(h.page.getByTitle("Undo")).toBeDisabled();
  await expect(h.page.getByTitle("Redo")).toBeDisabled();
  await h.page.locator("button[title='Note actions']").click();
  await expect(h.page.getByRole("menu").getByRole("menuitem", { name: "Settings" })).toBeVisible();
  await h.page.getByRole("menu").getByRole("menuitem", { name: "Settings" }).click();
  await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});
