/**
 * A name the disk already holds is kept. Names Boojy Notes makes (a typed
 * title, a new folder) are sanitised so the file can exist; names it reads
 * (a folder made in Finder, a note that was already there) are preserved
 * exactly, however the sanitiser would spell them, through every save, move
 * and restart.
 *
 * Reproduces review 2026-09-07 §2.3: the first save of a note inside a
 * Finder-made `Work: Client` wrote it to a new `Work_ Client` and removed the
 * original, while the sidebar still showed it under `Work: Client`; a
 * pre-existing `Why?.md` was renamed to `Why_.md` by its first edit; and
 * dragging the folder itself renamed it on the way. The names in this spec
 * cannot exist on Windows, so it runs where the disk can hold them. Two
 * tests, because expanding folders and dragging rows are slow on the CI
 * runner and one journey overran the per-test budget.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  type Vault,
  expandAllFolders,
  expectTitlesMatchFiles,
  launchApp,
  moveFolderTo,
  moveNoteToFolder,
  sleep,
  waitForFile,
} from "./harness";

test.skip(process.platform === "win32", "Finder-made names cannot exist on Windows");

const mdFiles = (vault: Vault) => vault.list().filter((f) => f.endsWith(".md"));

async function typeAtEnd(page: import("@playwright/test").Page, text: string) {
  await page.locator("[data-block-id]").first().click();
  await page.keyboard.press(END_OF_LINE);
  await page.keyboard.type(text);
}

test("a note in a Finder-named folder is saved where it is, and a note dragged in lands there", async () => {
  const h = await launchApp({
    "Work: Client/Why?.md": "Body.\n",
    "Draft /Plan.md": "Plan.\n",
    "Root.md": "Root.\n",
  });
  try {
    await expandAllFolders(h.page);

    // Editing a note saves it where it is, under the name it has.
    await h.openNote("Why?");
    await typeAtEnd(h.page, " more");
    await waitForFile(h.vault.file("Work: Client/Why?.md"), (t) => t === "Body. more\n", {
      label: "the edit at the note's own path",
    });
    await h.openNote("Plan");
    await typeAtEnd(h.page, " more");
    await waitForFile(h.vault.file("Draft /Plan.md"), (t) => t === "Plan. more\n", {
      label: "the edit under the trailing-space folder",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Draft /Plan.md", "Root.md", "Work: Client/Why?.md"]);

    // Dragging a note into the Finder-made folder files it in that directory.
    await moveNoteToFolder(h.page, "Root", "Work: Client");
    await waitForFile(h.vault.file("Work: Client/Root.md"), (t) => t === "Root.\n", {
      label: "the moved note inside the Finder-made folder",
    });
    await expect.poll(() => h.vault.exists("Root.md"), { timeout: 3_000 }).toBe(false);
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual([
      "Draft /Plan.md",
      "Work: Client/Root.md",
      "Work: Client/Why?.md",
    ]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a Finder-named folder dragged into another keeps its name, and its notes save there after a restart", async () => {
  const h = await launchApp({
    "Work: Client/Why?.md": "Body.\n",
    "Archive/Old.md": "Old.\n",
  });
  try {
    await moveFolderTo(h.page, "Work: Client", "Archive");
    await expect
      .poll(() => h.vault.exists("Archive/Work: Client/Why?.md"), { timeout: 5_000 })
      .toBe(true);
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Archive/Old.md", "Archive/Work: Client/Why?.md"]);

    // The moved note is still saved in place after the move.
    await expandAllFolders(h.page);
    await h.openNote("Why?");
    await typeAtEnd(h.page, " again");
    await waitForFile(h.vault.file("Archive/Work: Client/Why?.md"), (t) => t === "Body. again\n", {
      label: "the edit at the moved note's path",
    });

    await h.restart();
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(mdFiles(h.vault)).toEqual(["Archive/Old.md", "Archive/Work: Client/Why?.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
