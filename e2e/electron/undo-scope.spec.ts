/**
 * Undo and redo belong to the note the user is looking at.
 *
 * The stacks have always been note-tagged, but undo took the newest entry of
 * any note: typing in A, opening B and pressing Cmd+Z restored A — a note the
 * user was not looking at — and the write debounce then put the reverted text
 * on disk. With the buttons about to become visible chrome that would be an
 * everyday way to change a note off screen (2026-09-12).
 *
 * Needs the real app: the proof is what the two files hold once the text
 * commit, the write debounce and the watcher have all settled, and the switch
 * between notes is the seam where the typing group used to be shared.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
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

test.beforeEach(async () => {
  h = await launchApp({ [A]: `${A_TEXT}\n`, [B]: `${B_TEXT}\n` });
});

test.afterEach(async () => {
  await h?.close();
});

/** Put the caret at the end of the open note's first block and type. */
async function typeInto(title: string, text: string) {
  await h.openNote(title);
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(text);
}

test("undo in one note leaves the other note's file exactly as it was", async () => {
  await typeInto("Alpha", " edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "Alpha to save" });

  // Beta has never been edited: it has nothing to undo, and Alpha's entry is
  // not Beta's to spend.
  await h.openNote("Beta");
  await h.page.keyboard.press(`${MOD}+z`);
  await sleep(SETTLE_MS);

  expect(await noteText(h.page)).toBe(B_TEXT);
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);
  expect(h.vault.read(A).trimEnd()).toBe(`${A_TEXT} edited`);

  // Back in Alpha the edit is still its to undo.
  await h.openNote("Alpha");
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(A), (t) => !t.includes(" edited"), {
    label: "Alpha undo to save",
  });
  expect(await noteText(h.page)).toBe(A_TEXT);
  expect(h.vault.read(B).trimEnd()).toBe(B_TEXT);
  expectNoTempFiles(h.vault);
});

test("each note undoes and redoes its own edit, and the second note's first burst is its own entry", async () => {
  // The switch lands inside the 500ms typing group: before the fix Beta's
  // keystrokes joined Alpha's entry and Beta had nothing to undo.
  await typeInto("Alpha", " one");
  await typeInto("Beta", " two");
  await waitForFile(h.vault.file(B), (t) => t.includes(" two"), { label: "Beta to save" });

  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(B), (t) => !t.includes(" two"), { label: "Beta undo to save" });
  expect(await noteText(h.page)).toBe(B_TEXT);
  expect(h.vault.read(A).trimEnd()).toBe(`${A_TEXT} one`);

  await h.page.keyboard.press(`${MOD}+Shift+z`);
  await waitForFile(h.vault.file(B), (t) => t.includes(" two"), { label: "Beta redo to save" });
  expect(await noteText(h.page)).toBe(`${B_TEXT} two`);

  await h.openNote("Alpha");
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(A), (t) => !t.includes(" one"), { label: "Alpha undo to save" });
  expect(await noteText(h.page)).toBe(A_TEXT);
  expect(h.vault.read(B).trimEnd()).toBe(`${B_TEXT} two`);
  expectNoTempFiles(h.vault);
});

test("an edit in one note does not spend another note's redo", async () => {
  await typeInto("Alpha", " one");
  await waitForFile(h.vault.file(A), (t) => t.includes(" one"), { label: "Alpha to save" });
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(A), (t) => !t.includes(" one"), { label: "Alpha undo to save" });

  // Beta's edit ends Beta's redo lineage, not Alpha's.
  await typeInto("Beta", " two");
  await waitForFile(h.vault.file(B), (t) => t.includes(" two"), { label: "Beta to save" });

  await h.openNote("Alpha");
  await h.page.keyboard.press(`${MOD}+Shift+z`);
  await waitForFile(h.vault.file(A), (t) => t.includes(" one"), { label: "Alpha redo to save" });
  expect(await noteText(h.page)).toBe(`${A_TEXT} one`);
  expect(h.vault.read(B).trimEnd()).toBe(`${B_TEXT} two`);
  expectNoTempFiles(h.vault);
});

test("history does not survive a restart, and the files do", async () => {
  await typeInto("Alpha", " edited");
  await waitForFile(h.vault.file(A), (t) => t.includes(" edited"), { label: "Alpha to save" });

  await h.restart();
  await h.openNote("Alpha");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(`${MOD}+z`);
  await sleep(SETTLE_MS);

  expect(await noteText(h.page)).toBe(`${A_TEXT} edited`);
  expect(h.vault.read(A).trimEnd()).toBe(`${A_TEXT} edited`);
  expectNoTempFiles(h.vault);
});
