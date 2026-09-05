/**
 * Deletion safety on desktop. A single note goes to the OS Trash at once, with
 * a quiet toast. Deleting a folder or several notes asks first, in words that
 * say what actually happens: the notes move to the Trash; the folder on disk
 * and any file in it that is not a Boojy Notes note stay exactly where they
 * are. Cancelling changes nothing.
 *
 * Reproduces the review finding that "Delete folder" and "Delete N notes"
 * acted immediately on desktop, with no confirmation at all.
 *
 * The confirmation journey runs everywhere. The journey that confirms and then
 * inspects the vault depends on the OS Trash and runs on macOS only, as the CI
 * rule for anything touching the OS Trash requires.
 */
import { expect, test } from "@playwright/test";
import { MOD, SETTLE_MS, launchApp, sidebarNoteTitles, sleep } from "./harness";

const seed = {
  "Work/Note.md": "Note body.\n",
  "Work/budget.txt": "not a note\n",
  "Loose one.md": "One.\n",
  "Loose two.md": "Two.\n",
};

const mdFiles = (list: string[]) => list.filter((f) => f.endsWith(".md")).sort();

test("folder and bulk deletion ask first, in words that say what happens; cancel changes nothing", async () => {
  const h = await launchApp(seed);
  try {
    const dialog = h.page.getByRole("alertdialog");

    // Folder: the prompt counts the notes and promises to leave the rest alone.
    await h.page.locator('[data-folder-path="Work"]').click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Move 1 note to the Trash?");
    await expect(dialog).toContainText("Work");
    await expect(dialog).toContainText("stay");
    await h.page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(Object.keys(seed).sort());

    // Bulk: Cmd-click selects (a plain click opens); the prompt counts the selection.
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Loose one" })
      .click({ modifiers: [MOD] });
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Loose two" })
      .click({ modifiers: [MOD] });
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Loose two" })
      .click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete 2 notes" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Move 2 notes to the Trash?");
    await h.page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(Object.keys(seed).sort());
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Loose one", "Loose two"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("confirmed deletion moves only the notes; a single note goes at once with a toast", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp(seed);
  try {
    const dialog = h.page.getByRole("alertdialog");

    // Folder: the note leaves the vault; budget.txt and the folder itself stay.
    await h.page.locator('[data-folder-path="Work"]').click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete folder" }).click();
    await h.page.getByRole("button", { name: "Move to Trash" }).click();
    await expect.poll(() => h.vault.exists("Work/Note.md"), { timeout: 5_000 }).toBe(false);
    await sleep(SETTLE_MS);
    expect(h.vault.exists("Work/budget.txt")).toBe(true);
    expect(h.vault.read("Work/budget.txt")).toBe("not a note\n");
    expect(h.vault.exists("Work")).toBe(true);

    // Single note: immediate, no dialog, a quiet toast.
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Loose one" })
      .click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // Two toasts can be up: the folder above kept its budget.txt and said so.
    await expect(h.page.getByRole("alert").filter({ hasText: "Loose one" })).toContainText(
      "moved to the Trash",
    );
    await expect.poll(() => h.vault.exists("Loose one.md"), { timeout: 5_000 }).toBe(false);
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault.list())).toEqual(["Loose two.md"]);
    expect(h.vault.exists("Work/budget.txt")).toBe(true);

    // Nothing comes back after a restart, and nothing else went.
    await h.restart();
    expect(mdFiles(h.vault.list())).toEqual(["Loose two.md"]);
    expect(h.vault.exists("Work/budget.txt")).toBe(true);
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Loose two"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
