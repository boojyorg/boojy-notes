/**
 * Version History's list, from the outside: the ··· menu turns into the note's
 * past in place; the arrows show each version read-only in the note; typing
 * into the past asks what to do; Enter restores (Undo puts it back); F2 names;
 * Backspace deletes (Undo); the switch turns history off, keeping or deleting
 * what was; a press elsewhere hides the list and keeps the version, whose pill
 * is the way back. Needs the real app: versions live in the main process and
 * the note's text is read back from disk.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, END_OF_LINE, MOD, launchApp, noteText, waitForFile } from "./harness";

/** "Text." with two save points: "Text. one" and "Text. one two". */
async function withHistory(): Promise<AppHandle> {
  const h = await launchApp({ "Essay.md": "Text.\n", "Other.md": "Other.\n" });
  await h.openNote("Essay");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" one");
  await h.page.keyboard.press(`${MOD}+s`);
  await expect(h.page.locator("[data-toast-kind]")).toContainText("Save point");
  await expect(h.page.locator("[data-toast-kind]")).toHaveCount(0, { timeout: 8_000 });
  await h.page.keyboard.type(" two");
  await h.page.keyboard.press(`${MOD}+s`);
  await expect(h.page.locator("[data-toast-kind]")).toContainText("Save point");
  await waitForFile(h.vault.file("Essay.md"), (t) => t === "Text. one two\n");
  return h;
}

async function openList(h: AppHandle) {
  await h.page.locator("button[aria-label='Note actions']").click();
  await h.page.getByRole("menuitem", { name: /Version History/ }).click();
  const list = h.page.getByRole("listbox", { name: "Versions" });
  await expect(list).toBeFocused();
  return list;
}

const past = (h: AppHandle) => h.page.locator("[data-past-version]");
const pill = (h: AppHandle) => h.page.locator("[data-past-pill]");

test("the arrows show each version read-only in the note, and Escape is Now again", async () => {
  const h = await withHistory();
  try {
    const list = await openList(h);
    await expect(list.getByRole("option")).toHaveCount(4);
    await expect(list.getByRole("option").first()).toContainText("Now");
    // Nothing is chosen on opening; the first ↓ is the newest version.
    await expect(list.getByRole("option", { selected: true })).toHaveCount(0);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("ArrowDown");
    await expect(past(h)).toHaveText("Text. one");
    await expect(pill(h)).toBeVisible();
    await h.page.keyboard.press("ArrowDown");
    await expect(past(h)).toHaveText("Text.");

    await h.page.keyboard.press("Escape");
    await expect(past(h)).toHaveCount(0);
    await expect(list).toHaveCount(0);
    expect(await noteText(h.page)).toBe("Text. one two");
    expect(h.vault.read("Essay.md")).toBe("Text. one two\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typing into the past asks, and the file is untouched", async () => {
  const h = await withHistory();
  try {
    await openList(h);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("ArrowDown");
    await past(h).click();
    await h.page.keyboard.type("x");
    const ask = h.page.getByRole("dialog", { name: "Viewing an earlier version" });
    await expect(ask).toBeVisible();
    await expect(past(h)).toHaveText("Text. one");
    await ask.getByRole("button", { name: "Back to Now" }).click();
    await expect(past(h)).toHaveCount(0);
    expect(await noteText(h.page)).toBe("Text. one two");
    expect(h.vault.read("Essay.md")).toBe("Text. one two\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Enter restores a version, keeping what was there, and Undo puts it back", async () => {
  const h = await withHistory();
  try {
    // An edit no version holds yet: the restore keeps it first.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" three");
    await openList(h);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await expect.poll(() => noteText(h.page)).toBe("Text. one");
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "Text. one\n");
    const toast = h.page.locator("[data-toast-kind]").filter({ hasText: "Restored" });
    await expect(toast).toBeVisible();

    // What the note held is a version of its own.
    const list = await openList(h);
    await expect(list.getByRole("option").nth(1)).toContainText("Before restore");
    await h.page.keyboard.press("Escape");

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => noteText(h.page)).toBe("Text. one two three");
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "Text. one two three\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("F2 names a version, and Backspace deletes one, with Undo", async () => {
  const h = await withHistory();
  try {
    const list = await openList(h);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("F2");
    await h.page.keyboard.type("Submitted v1");
    await h.page.keyboard.press("Enter");
    await expect(list.getByRole("option").nth(1)).toContainText("Submitted v1");

    await list.focus();
    await h.page.keyboard.press("Backspace");
    await expect(list.getByRole("option")).toHaveCount(3);
    await h.page
      .locator("[data-toast-kind]")
      .filter({ hasText: "Submitted v1 deleted" })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(list.getByRole("option")).toHaveCount(4);
    await expect(list.getByRole("option").nth(1)).toContainText("Submitted v1");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the switch turns history off, keeping what was, and back on", async () => {
  const h = await withHistory();
  try {
    const list = await openList(h);
    await h.page.getByRole("switch", { name: "Keep history for this note" }).click();
    const dialog = h.page.getByRole("alertdialog");
    await expect(dialog).toContainText("What should happen to the 3 already saved?");
    await dialog.getByRole("button", { name: "Keep Them" }).click();
    await expect(list.getByRole("option")).toHaveCount(1);
    await expect(h.page.locator("[data-version-history]")).toContainText(
      "3 saved versions are kept",
    );
    await h.page.getByRole("switch", { name: "Keep history for this note" }).click();
    await expect(list.getByRole("option")).toHaveCount(4);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a press elsewhere hides the list and keeps the version; the pill shows it again, and × is Now", async () => {
  const h = await withHistory();
  try {
    const list = await openList(h);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("ArrowDown");
    await expect(past(h)).toHaveText("Text. one");
    await h.page.getByRole("tree").click({ position: { x: 5, y: 5 } });
    await expect(list).toHaveCount(0);
    await expect(past(h)).toHaveText("Text. one");

    await pill(h).locator("button").first().click();
    await expect(h.page.getByRole("listbox", { name: "Versions" })).toBeVisible();
    await pill(h).getByRole("button", { name: "Back to now" }).click();
    await expect(past(h)).toHaveCount(0);
    expect(await noteText(h.page)).toBe("Text. one two");

    // Another note is Now for the one left.
    await openList(h);
    await h.page.keyboard.press("ArrowDown");
    await h.openNote("Other");
    await expect(past(h)).toHaveCount(0);
    await expect(pill(h)).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
