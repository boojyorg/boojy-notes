/**
 * A note renamed or moved outside the app is still the same note, pending
 * edits included.
 *
 * Reproduces the review finding (2026-09-07, §2.9): the watcher reported an
 * outside rename as an unlink of the old path, the renderer rebuilt from disk
 * and kept the note because edits to it were pending, the flush found no
 * index entry for it and `write-note` made a fresh file under the old name,
 * or a whole directory under the old folder, beside the renamed one. Two
 * files, two rows, and the user's edits in the one they had just moved away
 * from.
 *
 * Rule (2026-09-08): the disk's own identity for a file is its inode; the
 * main process records it for every note it reads or writes, and an unlink
 * of an indexed path whose inode is found elsewhere in the vault is a move,
 * not a delete. The note's index entry follows, the renderer adopts the new
 * name and folder as a change of record (no history entry, the same path as
 * the filename a write produced), and the next flush writes the pending text
 * at the new path. Needs the real app: the watcher, the index and the write
 * debounce are the whole story.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  editorTitle,
  expandAllFolders,
  expectTitlesMatchFiles,
  launchApp,
  noteText,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

const mdFiles = (h: Awaited<ReturnType<typeof launchApp>>) =>
  h.vault.list().filter((f) => f.endsWith(".md"));

/** Type at the end of the first block, leaving the text pending in the write debounce. */
async function typeAtEnd(h: Awaited<ReturnType<typeof launchApp>>, text: string) {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(text);
}

test("a note renamed outside while edits are pending follows the new name", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await typeAtEnd(h, " one");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "Alpha body. one\n");
    await sleep(SETTLE_MS);

    // Inside the write debounce of the next keystroke, the file is renamed in
    // Finder. Before: the unlink rebuilt state from disk, the kept note had no
    // index entry, and the flush recreated Alpha.md beside Renamed.md.
    await typeAtEnd(h, " two");
    fs.renameSync(h.vault.file("Alpha.md"), h.vault.file("Renamed.md"));

    await waitForFile(h.vault.file("Renamed.md"), (t) => t === "Alpha body. one two\n", {
      label: "the pending edit at the new name",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Renamed.md"]);
    expect(await sidebarNoteTitles(h.page)).toEqual(["Renamed"]);
    expect(await editorTitle(h.page)).toBe("Renamed");
    expect(await noteText(h.page)).toBe("Alpha body. one two");

    // The note is still the note: typing on reaches the renamed file.
    await typeAtEnd(h, " three");
    await waitForFile(h.vault.file("Renamed.md"), (t) => t === "Alpha body. one two three\n");
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Renamed.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note renamed outside before its first save of the session follows the new name, with no conflict copy", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    // The app has read this file and never written it: the only bytes it
    // knows are the ones it loaded. The rename lands with the first edit
    // still inside the write debounce.
    await typeAtEnd(h, " one");
    fs.renameSync(h.vault.file("Alpha.md"), h.vault.file("Renamed.md"));

    await waitForFile(h.vault.file("Renamed.md"), (t) => t === "Alpha body. one\n", {
      label: "the pending edit at the new name",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Renamed.md"]);
    expect(await sidebarNoteTitles(h.page)).toEqual(["Renamed"]);
    expect(await editorTitle(h.page)).toBe("Renamed");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a folder moved outside while a note in it has pending edits does not bring the old folder back", async () => {
  const h = await launchApp({ "Old/Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Alpha");
    await typeAtEnd(h, " one");
    await waitForFile(h.vault.file("Old/Alpha.md"), (t) => t === "Alpha body. one\n");
    await sleep(SETTLE_MS);

    // `mv Old New` in the shell. Before: `Old/Alpha.md` came back, directory
    // and all, holding the pending edit, while `New/Alpha.md` kept the old text.
    await typeAtEnd(h, " two");
    fs.renameSync(h.vault.file("Old"), h.vault.file("New"));

    await waitForFile(h.vault.file("New/Alpha.md"), (t) => t === "Alpha body. one two\n", {
      label: "the pending edit under the moved folder",
    });
    await sleep(SETTLE_MS);
    expect(h.vault.exists("Old")).toBe(false);
    expect(mdFiles(h)).toEqual(["Beta.md", "New/Alpha.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(await h.page.locator('[data-folder-path="New"]').count()).toBe(1);
    expect(await h.page.locator('[data-folder-path="Old"]').count()).toBe(0);
    expect(await editorTitle(h.page)).toBe("Alpha");
    expect(await noteText(h.page)).toBe("Alpha body. one two");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note renamed outside with nothing pending keeps its place in the editor", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    const before = h.vault.mtimeMs("Alpha.md");
    fs.renameSync(h.vault.file("Alpha.md"), h.vault.file("Renamed.md"));

    // The open note takes its new name; nothing is rewritten for a rename
    // the app did not make, so the file's mtime is untouched.
    await expect.poll(() => editorTitle(h.page), { timeout: 5_000 }).toBe("Renamed");
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Beta.md", "Renamed.md"]);
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Beta", "Renamed"]);
    expect(await noteText(h.page)).toBe("Alpha body.");
    expect(h.vault.mtimeMs("Renamed.md")).toBe(before);

    await typeAtEnd(h, " more");
    await waitForFile(h.vault.file("Renamed.md"), (t) => t === "Alpha body. more\n");
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Beta.md", "Renamed.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
