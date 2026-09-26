/**
 * Recently Deleted, from the outside: a note deleted in the app waits in the
 * sidebar's pinned row for 30 days; it comes back where it was, its folder made
 * again if that went, keeping its history; the deletion toast's Undo does the
 * same; deleting for good asks first and leaves nothing. Needs the real app:
 * the file goes to the OS Trash (macOS) and comes back from the history store.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp, noteText, sidebarNoteTitles, waitForFile } from "./harness";

async function deleteNote(h: AppHandle, title: string) {
  await h.page
    .locator("[data-note-id]")
    .filter({ hasText: title })
    .first()
    .click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
}

const binRow = (h: AppHandle) => h.page.getByTestId("recently-deleted-row");
const bin = (h: AppHandle) => h.page.getByRole("dialog", { name: "Recently Deleted" });

test("a deleted note waits in Recently Deleted and comes back where it was", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp({ "Projects/Old plan.md": "The plan.\n", "Keep.md": "Keep.\n" });
  try {
    await expect(binRow(h)).toBeVisible();
    await h.page.getByRole("treeitem", { name: /^Projects/ }).click();
    await deleteNote(h, "Old plan");
    await expect(h.page.locator("[data-toast-kind]")).toContainText(
      '"Old plan" moved to Recently Deleted',
    );
    await expect.poll(() => fs.existsSync(h.vault.file("Projects/Old plan.md"))).toBe(false);
    // No count on the row: it is the same quiet row, full or empty.
    await expect(binRow(h)).toHaveText("Recently Deleted");

    // Its folder went too: putting it back makes the folder again.
    fs.rmdirSync(h.vault.file("Projects"));
    await binRow(h).click();
    await expect(bin(h).getByRole("option")).toHaveText(["Projects / Old plan"]);
    await bin(h).getByRole("option").hover();
    await bin(h).getByRole("button", { name: "Put back “Old plan”" }).click();
    await waitForFile(h.vault.file("Projects/Old plan.md"), (t) => t === "The plan.\n");
    await expect(bin(h).getByRole("option")).toHaveCount(0);
    await expect(bin(h)).toContainText("Nothing deleted in the last 30 days.");
    await h.openNote("Old plan");
    expect(await noteText(h.page)).toBe("The plan.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Undo on the deletion toast puts the note back", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp({ "Loose.md": "Loose note.\n", "Keep.md": "Keep.\n" });
  try {
    await deleteNote(h, "Loose");
    await h.page
      .locator("[data-toast-kind]")
      .filter({ hasText: "Recently Deleted" })
      .getByRole("button", { name: "Undo" })
      .click();
    await waitForFile(h.vault.file("Loose.md"), (t) => t === "Loose note.\n");
    await expect.poll(() => sidebarNoteTitles(h.page)).toContain("Loose");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("deleting for good asks first, and leaves nothing to put back", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp({ "Secret.md": "Private.\n", "Keep.md": "Keep.\n" });
  try {
    await deleteNote(h, "Secret");
    await expect.poll(() => fs.existsSync(h.vault.file("Secret.md"))).toBe(false);
    await binRow(h).click();
    await bin(h).getByRole("option").hover();
    await bin(h).getByRole("button", { name: "Delete “Secret” permanently" }).click();
    const confirm = h.page.getByRole("alertdialog");
    await expect(confirm).toContainText("This can’t be undone.");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(bin(h).getByRole("option")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
