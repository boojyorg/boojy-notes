/**
 * Folders are directories.
 *
 * A folder in the sidebar is the directory on disk, the way Finder and
 * Obsidian treat it: every subdirectory shows, empty or not; New folder makes
 * the directory at once and it survives a restart; a folder can be created
 * inside a folder, renamed as one operation that carries every file with it
 * (notes and otherwise), and dragged into another folder or back to the root.
 * Deleting a folder still sends only its notes to the Trash; the directory
 * goes only if nothing else is left in it.
 *
 * Reproduces the pre-change state where a folder existed only as "where a
 * note is": a new folder vanished on restart, a rename moved the notes one by
 * one and left a PDF behind in the old directory, and there was no way to
 * nest or move a folder at all.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  expandAllFolders,
  expectTitlesMatchFiles,
  launchApp,
  moveFolderTo,
  noteText,
  renameRow,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

const folderRow = (page: import("@playwright/test").Page, path: string) =>
  page.locator(`[data-folder-path="${path}"]`);

/** Commit the inline rename that a freshly created folder opens with. */
async function nameNewFolder(page: import("@playwright/test").Page, name: string) {
  const input = page.locator("input:focus");
  await input.waitFor();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
}

test("a new folder is a directory at once, can nest, and is still there after a restart", async () => {
  const h = await launchApp({ "Loose.md": "One.\n" });
  try {
    // The header's New folder control is revealed on hover; create at the root.
    await h.page.getByRole("button", { name: "New folder" }).click();
    await nameNewFolder(h.page, "Projects");
    await expect(folderRow(h.page, "Projects")).toBeVisible();
    await expect.poll(() => h.vault.exists("Projects")).toBe(true);
    expect(fs.statSync(h.vault.file("Projects")).isDirectory()).toBe(true);

    // New folder inside, from the folder's own menu.
    await folderRow(h.page, "Projects").click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "New folder inside" }).click();
    await nameNewFolder(h.page, "Client A");
    await expect(folderRow(h.page, "Projects/Client A")).toBeVisible();
    await expect.poll(() => h.vault.exists("Projects/Client A")).toBe(true);

    // Both are real directories, so both come back.
    await h.restart();
    await expandAllFolders(h.page);
    await expect(folderRow(h.page, "Projects")).toBeVisible();
    await expect(folderRow(h.page, "Projects/Client A")).toBeVisible();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a folder that holds only non-note files, or nothing, still shows as a folder", async () => {
  const h = await launchApp(
    { "Uni/COMP336/Weeks/Week 1.md": "Lecture.\n" },
    {
      prepare: (vault) => {
        vault.write("Uni/COMP336/Resources/slides.pdf", "pdf");
        fs.mkdirSync(vault.file("Uni/Empty"), { recursive: true });
        fs.mkdirSync(vault.file(".obsidian"), { recursive: true });
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
      },
    },
  );
  try {
    await expandAllFolders(h.page);
    await expect(folderRow(h.page, "Uni/COMP336/Resources")).toBeVisible();
    await expect(folderRow(h.page, "Uni/Empty")).toBeVisible();
    await expect(folderRow(h.page, ".obsidian")).toHaveCount(0);
    await expect(folderRow(h.page, "attachments")).toHaveCount(0);
    expect(await sidebarNoteTitles(h.page)).toEqual(["Week 1"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("renaming a folder moves everything in it together, and the open note follows", async () => {
  const seed = {
    "Work/Note.md": "Note body.\n",
    "Work/Deep/Other.md": "Other.\n",
  };
  const h = await launchApp(seed, {
    prepare: (vault) => vault.write("Work/budget.pdf", "pdf"),
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Note");
    const noteMtime = h.vault.mtimeMs("Work/Note.md");

    // The name a directory cannot hold is sanitised, and the sidebar shows the
    // real one at once — the same rule a note's title follows.
    await renameRow(h.page, "Work", "Clients: 2026");
    await expect(folderRow(h.page, "Clients_ 2026")).toBeVisible();
    await expect(folderRow(h.page, "Work")).toHaveCount(0);
    await sleep(SETTLE_MS);

    // One rename: notes, the nested folder and the PDF all travelled; nothing
    // was left behind and nothing was rewritten (the note's mtime is untouched).
    expect(h.vault.exists("Work")).toBe(false);
    expect(h.vault.read("Clients_ 2026/budget.pdf")).toBe("pdf");
    expect(h.vault.read("Clients_ 2026/Deep/Other.md")).toBe("Other.\n");
    expect(h.vault.mtimeMs("Clients_ 2026/Note.md")).toBe(noteMtime);
    expect(await noteText(h.page)).toBe("Note body.");

    // Typing into the open note now lands at its new path.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" More");
    await waitForFile(h.vault.file("Clients_ 2026/Note.md"), (c) => c.includes("Note body. More"));
    expect(h.vault.exists("Work")).toBe(false);

    await h.restart();
    await expandAllFolders(h.page);
    await expect(folderRow(h.page, "Clients_ 2026/Deep")).toBeVisible();
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("dragging a folder onto a folder nests it; dropping it on the Notes header moves it back out", async () => {
  const h = await launchApp({ "Work/Note.md": "Note.\n", "Archive/Old.md": "Old.\n" });
  try {
    await moveFolderTo(h.page, "Work", "Archive");
    await expandAllFolders(h.page);
    await expect(folderRow(h.page, "Archive/Work")).toBeVisible();
    await expect.poll(() => h.vault.exists("Archive/Work/Note.md")).toBe(true);
    expect(h.vault.exists("Work")).toBe(false);

    await moveFolderTo(h.page, "Archive/Work", null);
    await expect(folderRow(h.page, "Work")).toBeVisible();
    await expect.poll(() => h.vault.exists("Work/Note.md")).toBe(true);
    expect(h.vault.exists("Archive/Work")).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a folder made or removed in Finder shows up, and goes, on its own", async () => {
  const h = await launchApp({ "Loose.md": "One.\n" });
  try {
    fs.mkdirSync(h.vault.file("External/Nested"), { recursive: true });
    await expect(folderRow(h.page, "External")).toBeVisible({ timeout: 5_000 });
    await folderRow(h.page, "External").click();
    await expect(folderRow(h.page, "External/Nested")).toBeVisible();

    fs.rmSync(h.vault.file("External"), { recursive: true, force: true });
    await expect(folderRow(h.page, "External")).toHaveCount(0, { timeout: 5_000 });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("deleting a folder removes the directory only once nothing is left in it", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp(
    { "Work/Note.md": "Note.\n", "Solo/Only.md": "Only.\n" },
    { prepare: (vault) => vault.write("Work/budget.txt", "not a note\n") },
  );
  try {
    // Its one note goes to the Trash; the emptied directory goes with it.
    await folderRow(h.page, "Solo").click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete folder" }).click();
    await h.page.getByRole("button", { name: "Move to Trash" }).click();
    await expect.poll(() => h.vault.exists("Solo"), { timeout: 5_000 }).toBe(false);
    await expect(folderRow(h.page, "Solo")).toHaveCount(0);

    // The note goes; budget.txt keeps the directory, and the row, with a toast saying so.
    await folderRow(h.page, "Work").click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete folder" }).click();
    const dialog = h.page.getByRole("alertdialog");
    await expect(dialog).toContainText("removed only if nothing is left");
    await h.page.getByRole("button", { name: "Move to Trash" }).click();
    await expect.poll(() => h.vault.exists("Work/Note.md"), { timeout: 5_000 }).toBe(false);
    await expect(h.page.getByRole("alert")).toContainText("stays on disk");
    expect(h.vault.read("Work/budget.txt")).toBe("not a note\n");
    await expect(folderRow(h.page, "Work")).toBeVisible();

    // An empty folder asks nothing and just goes, on screen and on disk.
    await h.page.getByRole("button", { name: "New folder" }).click();
    await nameNewFolder(h.page, "Fresh");
    await expect.poll(() => h.vault.exists("Fresh")).toBe(true);
    await folderRow(h.page, "Fresh").click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => h.vault.exists("Fresh")).toBe(false);
    await expect(folderRow(h.page, "Fresh")).toHaveCount(0);

    await h.restart();
    expect(h.vault.exists("Work/budget.txt")).toBe(true);
    await expect(folderRow(h.page, "Work")).toBeVisible();
    expect(await sidebarNoteTitles(h.page)).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
