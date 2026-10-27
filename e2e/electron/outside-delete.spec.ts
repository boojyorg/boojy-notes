/**
 * A note deleted outside the app (another editor, an AI tool, a sync client)
 * is kept in Recently Deleted like one deleted here. The open note stays on
 * screen read-only with a notice whose Restore puts it back, never over a
 * file that has taken its name since. One deleted while edits to it were
 * pending is written back with them, and the notice says so. Needs the real
 * app: the watcher, the history store and the restore are the subject.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  SETTLE_MS,
  launchApp,
  mdFiles,
  sleep,
  waitForFile,
} from "./harness";

const name = (h: AppHandle) => h.page.getByRole("textbox", { name: "Note title" });
const notice = (h: AppHandle) => h.page.locator("[data-toast-kind]");
const binRow = (h: AppHandle) => h.page.getByTestId("recently-deleted-row");
const bin = (h: AppHandle) => h.page.getByRole("dialog", { name: "Recently Deleted" });

/** The open note's caret at the end of its first line, everything saved. */
async function settledIn(h: AppHandle, title: string) {
  await h.openNote(title);
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await sleep(SETTLE_MS);
}

test("the open note deleted outside stays on screen read-only, and Restore puts it back", async () => {
  const h = await launchApp({ "Essay.md": "The essay.\n", "Other.md": "Other.\n" });
  try {
    await settledIn(h, "Essay");
    fs.unlinkSync(h.vault.file("Essay.md"));

    await expect(notice(h)).toContainText(
      '"Essay" was deleted outside Boojy Notes. It\'s kept in Recently Deleted.',
      { timeout: 5_000 },
    );
    await expect(h.page.locator("[data-deleted-title]")).toHaveText("Essay");
    await expect(h.page.locator("[data-past-version]")).toContainText("The essay.");
    expect(fs.existsSync(h.vault.file("Essay.md"))).toBe(false);

    await notice(h).getByRole("button", { name: "Restore" }).click();
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "The essay.\n");
    await expect(name(h)).toHaveText("Essay");
    await expect(h.page.locator("[data-deleted-title]")).toHaveCount(0);
    // Back in the vault, editable, and out of the bin.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" More.");
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "The essay. More.\n");
    await binRow(h).click();
    await expect(bin(h).getByRole("option")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Restore never replaces a file that has taken the deleted note's name", async () => {
  const h = await launchApp({ "Essay.md": "Mine.\n" });
  try {
    await settledIn(h, "Essay");
    fs.unlinkSync(h.vault.file("Essay.md"));
    await expect(notice(h)).toContainText("was deleted outside", { timeout: 5_000 });
    // Another tool writes a new note under the same name.
    h.vault.write("Essay.md", "Theirs, new.\n");
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Essay" })).toHaveCount(1, {
      timeout: 5_000,
    });

    await notice(h).getByRole("button", { name: "Restore" }).click();
    await expect
      .poll(() => mdFiles(h.vault).sort(), { timeout: 5_000 })
      .toEqual(["Essay-2.md", "Essay.md"]);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("Theirs, new.\n");
    expect(h.vault.read("Essay-2.md")).toBe("Mine.\n");
  } finally {
    await h.close();
  }
});

test("the open note deleted outside while edits are pending is written back with them, and says so", async () => {
  const h = await launchApp({ "Essay.md": "The essay.\n" });
  try {
    await settledIn(h, "Essay");
    await h.page.keyboard.type(" Mine.", { delay: 60 });
    fs.unlinkSync(h.vault.file("Essay.md"));

    await expect(notice(h)).toContainText(
      '"Essay" was deleted outside Boojy Notes while you were editing it. Your version was saved again.',
      { timeout: 5_000 },
    );
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "The essay. Mine.\n");
    await expect(name(h)).toHaveText("Essay");
    // On disk again, so not in the bin.
    await sleep(SETTLE_MS);
    await binRow(h).click();
    await expect(bin(h).getByRole("option")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("another note deleted outside goes to Recently Deleted quietly, and the open note is untouched", async () => {
  const h = await launchApp({ "Essay.md": "The essay.\n", "Other.md": "Other text.\n" });
  try {
    await settledIn(h, "Essay");
    fs.unlinkSync(h.vault.file("Other.md"));
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Other" })).toHaveCount(0, {
      timeout: 5_000,
    });
    await h.page.keyboard.type(" typed");
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "The essay. typed\n");
    await expect(notice(h)).toHaveCount(0);
    await binRow(h).click();
    await expect(bin(h).getByRole("option")).toHaveText(["Other"]);
    await bin(h).getByRole("option", { name: /Other/ }).click();
    await expect(h.page.locator("[data-past-version]")).toContainText("Other text.");
  } finally {
    await h.close();
  }
});
