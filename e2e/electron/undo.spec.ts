/**
 * Undo must change what the user sees, and the screen and the file must agree.
 *
 * Reproduces the review finding where Cmd+Z after plain typing reverted the
 * file on disk but left the old text on screen; the next keystroke then wrote
 * the stale screen back over the undone file. A text-only undo produced no
 * "render change" the editor recognised, so the block repaint never ran.
 * Needs the real app: the bug lives between the text-commit debounce, the
 * editor's render comparator and the write debounce, none of which jsdom sees.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  noteText,
  expectNoTempFiles,
  expectNoteMatchesDisk,
  launchApp,
  waitForFile,
  type AppHandle,
} from "./harness";

const NOTE = "Journal.md";
const ORIGINAL = "Today was fine.";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: `${ORIGINAL}\n` });
  await h.openNote("Journal");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
});

test.afterEach(async () => {
  await h?.close();
});

test("undo after a pause repaints the screen, and typing continues from the undone text", async () => {
  await h.page.keyboard.type(" A");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(" A"), { label: "typed text to save" });

  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(NOTE), (t) => !t.includes(" A"), { label: "undo to save" });
  expect(await noteText(h.page)).toBe(ORIGINAL);
  await expectNoteMatchesDisk(h.page, h.vault, NOTE);

  await h.page.keyboard.type(" B");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(" B"), { label: "post-undo typing" });
  expect(await noteText(h.page)).toBe(`${ORIGINAL} B`);
  await expectNoteMatchesDisk(h.page, h.vault, NOTE);
  expectNoTempFiles(h.vault);
});

test("undo inside the text-commit window is not overwritten by the pending commit", async () => {
  await h.page.keyboard.type(" fast");
  await h.page.keyboard.press(`${MOD}+z`);

  await expectNoteMatchesDisk(h.page, h.vault, NOTE);
  expect(await noteText(h.page)).toBe(ORIGINAL);
  expect(h.vault.read(NOTE).trimEnd()).toBe(ORIGINAL);
});

test("redo after undo repaints too", async () => {
  await h.page.keyboard.type(" A");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(" A"));
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(NOTE), (t) => !t.includes(" A"));

  await h.page.keyboard.press(`${MOD}+Shift+z`);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(" A"), { label: "redo to save" });
  expect(await noteText(h.page)).toBe(`${ORIGINAL} A`);
  await expectNoteMatchesDisk(h.page, h.vault, NOTE);
});
