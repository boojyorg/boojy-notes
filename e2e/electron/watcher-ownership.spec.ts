/**
 * The watcher suppresses only what the app itself did.
 *
 * Rule (2026-09-08): an own write is remembered by its bytes until the first
 * event that shows the file has left the app's hands: an outside change to
 * other bytes, or the file going away (an unlink, own or outside). After that
 * a file holding those bytes again is a real change, not an echo. An own
 * unlink (a Trash move, a rename's old path) is claimed once and consumed by
 * the unlink it causes; an unlink nobody claimed is real however soon it
 * lands after the app's own save. Reproduces review findings §2.2 (a revert
 * to previously written bytes was dropped and later overwritten; a note put
 * back from the Trash with identical bytes never reappeared) and §2.9 (a real
 * outside delete inside 1.5 s of the app's own save was ignored). Needs the
 * real app: the watcher, its echo suppression and the write debounce are
 * what the bugs live in.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  launchApp,
  noteText,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

const titles = async (h: Awaited<ReturnType<typeof launchApp>>) =>
  (await sidebarNoteTitles(h.page)).sort();

test("an outside change back to the bytes the app last wrote is shown, and typing on keeps it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "Alpha body. one\n");
    await sleep(SETTLE_MS);

    // An outside edit, taken at once (nothing is pending locally).
    h.vault.write("Alpha.md", "Alpha body. one\nAdded outside.\n");
    await expect
      .poll(() => noteText(h.page), { timeout: 5_000 })
      .toBe("Alpha body. one\nAdded outside.");

    // Then the outside editor reverts it (git checkout, Undo in Obsidian, a
    // sync restore): the file holds exactly the app's own last write again.
    // Before: dropped as an echo of that write; the editor kept the
    // outside line and the next save wrote it back over the revert.
    h.vault.write("Alpha.md", "Alpha body. one\n");
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toBe("Alpha body. one");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one\n");

    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes(" more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one more\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside delete right after the app's own save removes the note", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "Alpha body. one\n");
    // Well inside the old 1.5 s own-write window. Before: the unlink was
    // dropped on the clock alone and the note stayed in the sidebar.
    fs.unlinkSync(h.vault.file("Alpha.md"));

    await expect.poll(() => titles(h), { timeout: 5_000 }).toEqual(["Beta"]);
    await sleep(SETTLE_MS);
    expect(h.vault.list(), "the deleted note is not written back").toEqual(["Beta.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note deleted outside and then restored with identical bytes reappears", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    const bytes = await waitForFile(h.vault.file("Alpha.md"), (t) => t === "Alpha body. one\n");
    // Past the old 1.5 s own-write window, so this test is about the return
    // of the bytes alone; the delete inside the window is the test above.
    await sleep(2_000);

    fs.unlinkSync(h.vault.file("Alpha.md"));
    await expect.poll(() => titles(h), { timeout: 5_000 }).toEqual(["Beta"]);

    // The same bytes come back (a sync client's restore, `git checkout`).
    // Before: recognised as the app's own write and dropped; the note was
    // gone until relaunch.
    h.vault.write("Alpha.md", bytes);
    await expect.poll(() => titles(h), { timeout: 5_000 }).toEqual(["Alpha", "Beta"]);
    await h.openNote("Alpha");
    expect(await noteText(h.page)).toBe("Alpha body. one");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe(bytes);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note deleted in the app and put back from the Trash reappears", async () => {
  test.skip(process.platform !== "darwin", "moves files through the OS Trash");
  // A name no earlier run left in the Trash, so the file keeps it there.
  const title = `Put back ${Date.now()}`;
  const trashed = path.join(os.homedir(), ".Trash", `${title}.md`);
  const h = await launchApp({ [`${title}.md`]: "Restore me.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote(title);
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" now");
    await waitForFile(h.vault.file(`${title}.md`), (t) => t === "Restore me. now\n");
    await sleep(SETTLE_MS);
    await h.openNote("Beta");

    await h.page.locator("[data-note-id]").filter({ hasText: title }).click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect.poll(() => fs.existsSync(trashed), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => titles(h), { timeout: 5_000 }).toEqual(["Beta"]);

    // Finder's Put Back: the file returns with the bytes the app last wrote.
    fs.renameSync(trashed, h.vault.file(`${title}.md`));
    await expect.poll(() => titles(h), { timeout: 5_000 }).toEqual(["Beta", title]);
    await h.openNote(title);
    expect(await noteText(h.page)).toBe("Restore me. now");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
    fs.rmSync(trashed, { force: true });
  }
});
