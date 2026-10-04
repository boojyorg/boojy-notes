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
    // Named by the app's chip, over the list, never a native title. Re-hovered
    // until it shows (the Linux runner's stray mouseout cancels the rest timer).
    const putBack = bin(h).getByRole("button", { name: "Restore “Old plan”" });
    await expect(putBack).not.toHaveAttribute("title", /.*/);
    await expect(async () => {
      await putBack.hover();
      await expect(h.page.getByTestId("row-action-tooltip")).toHaveText(/Restore note/, {
        timeout: 1_500,
      });
    }).toPass({ timeout: 10_000 });
    await putBack.click();
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

test("deleting for good asks first, and leaves nothing to restore", async () => {
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

test("a click shows a deleted note read-only; typing asks; Restore opens it; Escape goes back", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp({
    "Plan.md": "The plan.\n\n- one\n",
    "Draft.md": "A draft.\n",
    "Keep.md": "Keep.\n",
  });
  try {
    await deleteNote(h, "Plan");
    await deleteNote(h, "Draft");
    await expect.poll(() => fs.existsSync(h.vault.file("Plan.md"))).toBe(false);
    await h.openNote("Keep");
    const name = h.page.getByRole("textbox", { name: "Note title" });
    await expect(name).toHaveText("Keep");

    // A click shows it in the note's place, read-only; the list stays; the
    // vault is untouched.
    await binRow(h).click();
    await expect(bin(h).getByTestId("recently-deleted-hint")).toHaveText(
      "Click a note to view it.",
    );
    await bin(h).getByRole("option", { name: /Plan/ }).click();
    await expect(h.page.locator("[data-deleted-title]")).toHaveText("Plan");
    await expect(h.page.locator("[data-past-version]")).toContainText("The plan.");
    const button = h.page.getByTestId("deleted-note-button");
    await expect(button).toBeVisible();
    await expect(bin(h)).toBeVisible();
    expect(fs.existsSync(h.vault.file("Plan.md"))).toBe(false);

    // Typing asks; Cancel keeps it as it was.
    await h.page.locator("[data-past-version] [data-block-id]").first().click();
    await h.page.keyboard.type("x");
    const ask = h.page.getByRole("dialog", { name: "Viewing a deleted note" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toHaveCount(0);
    await expect(h.page.locator("[data-past-version]")).toContainText("The plan.");
    expect(fs.existsSync(h.vault.file("Plan.md"))).toBe(false);

    // Restore from the question: back in the vault, open and editable.
    await h.page.locator("[data-past-version] [data-block-id]").first().click();
    await h.page.keyboard.type("x");
    await ask.getByRole("button", { name: "Restore" }).click();
    await waitForFile(h.vault.file("Plan.md"), (t) => t === "The plan.\n\n- one\n");
    await expect(name).toHaveText("Plan");
    await expect(button).toHaveCount(0);

    // Another: its corner button's menu offers Restore, Delete permanently and
    // Close; Close goes back to the open note.
    await binRow(h).click();
    await bin(h).getByRole("option", { name: /Draft/ }).click();
    await expect(h.page.locator("[data-deleted-title]")).toHaveText("Draft");
    await h.page.locator("[data-past-version]").click();
    await button.click();
    const menu = h.page.getByTestId("deleted-note-menu");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Restore note",
      "Delete permanently",
      "Close",
    ]);
    await menu.getByRole("menuitem", { name: "Close" }).click();
    await expect(h.page.locator("[data-deleted-title]")).toHaveCount(0);
    await expect(name).toHaveText("Plan");
    expect(fs.existsSync(h.vault.file("Draft.md"))).toBe(false);

    // Again, then Escape: the list and the view both go, the open note stays.
    await binRow(h).click();
    await bin(h).getByRole("option", { name: /Draft/ }).click();
    await expect(h.page.locator("[data-deleted-title]")).toHaveText("Draft");
    await h.page.keyboard.press("Escape");
    await expect(bin(h)).toHaveCount(0);
    await expect(h.page.locator("[data-deleted-title]")).toHaveCount(0);
    await expect(name).toHaveText("Plan");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
