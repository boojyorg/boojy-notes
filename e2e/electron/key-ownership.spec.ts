/**
 * Keys and focus belong to the closest active surface (review 2026-09-07,
 * §1.2, §1.6, §1.13, §4.1, §4.2, §4.6). One keypress acts on the surface the
 * user is looking at and on nothing beneath it:
 *
 * - Enter in a confirm activates the focused button, so once the user has
 *   Tabbed to Cancel it deletes nothing; Tab stays inside the dialog.
 * - Cmd+Z in the search field or a rename field is that field's undo; the
 *   note behind it is untouched.
 * - Escape closes the topmost layer only: a menu or a rename over the overlay
 *   sidebar leaves the sidebar showing.
 * - Cmd+N and Cmd+P do nothing while Settings is open.
 * - Cmd+K is the link editor; Cmd+P is Search.
 * - A typed tag keeps the space that ends it, and Enter after a tag that is
 *   already complete, or matches nothing, is the editor's Enter.
 * - Rename from the row's ··· menu opens the field and keeps focus in it.
 *
 * Each case is proven on what the user sees and, where a file is involved,
 * what reached the disk.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, noteText, sleep, waitForFile } from "./harness";

const isMac = process.platform === "darwin";

test("Enter in a confirm activates the focused button, and Tab stays inside the dialog", async () => {
  // The desktop prompt is a move to the Trash, recoverable, so it opens on
  // Delete (a permanent web deletion opens on Cancel). Either way Enter
  // presses the button that holds focus; before this it confirmed regardless.
  const seed = { "One.md": "One.\n", "Two.md": "Two.\n", "Keep.md": "Keep.\n" };
  const h = await launchApp(seed);
  try {
    const dialog = h.page.getByRole("alertdialog");
    const cancel = h.page.getByRole("button", { name: "Cancel" });
    const del = h.page.getByRole("button", { name: "Move to Trash" });
    const selectTwo = async () => {
      // A plain click clears any earlier selection before the Cmd-clicks build one.
      await h.page.locator("[data-note-id]").filter({ hasText: "Keep" }).click();
      await h.page
        .locator("[data-note-id]")
        .filter({ hasText: "One" })
        .click({ modifiers: [MOD] });
      await h.page
        .locator("[data-note-id]")
        .filter({ hasText: "Two" })
        .click({ modifiers: [MOD] });
      await h.page.locator("[data-note-id]").filter({ hasText: "Two" }).click({ button: "right" });
      await h.page.getByRole("menuitem", { name: "Delete 2 notes" }).click();
      await expect(dialog).toBeVisible();
    };

    // Tab to Cancel; Enter presses Cancel: nothing is deleted.
    await selectTwo();
    await expect(del).toBeFocused();
    await h.page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    // Tab wraps inside the dialog rather than leaving it.
    await h.page.keyboard.press("Tab");
    await expect(del).toBeFocused();
    await h.page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await h.page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(Object.keys(seed).sort());
    await expect(h.page.locator("[data-note-id]")).toHaveCount(3);

    // Enter on the default button deletes.
    await selectTwo();
    await expect(del).toBeFocused();
    await h.page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(h.page.locator("[data-note-id]")).toHaveCount(1);
    if (isMac) {
      await expect.poll(() => h.vault.list().filter((f) => f.endsWith(".md"))).toEqual(["Keep.md"]);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Cmd+Z in the search field and in a rename field belongs to the field, not the note", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body\n", "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("more"));

    // The palette's field: undo there never reaches the note's history.
    const field = h.page.getByRole("textbox", { name: "Search notes" });
    await h.page.keyboard.press(`${MOD}+p`);
    await expect(field).toBeFocused();
    await h.page.keyboard.type("abc");
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(h.page.getByRole("dialog", { name: "Search" })).toBeVisible();
    expect(await noteText(h.page)).toBe("Alpha body more");
    await h.page.keyboard.press("Escape");

    // The sidebar's rename field, the same. The double-click's first click
    // opens Beta, so the note's undo, had it run, would show on Alpha's file.
    await h.page.locator('[role="treeitem"]').filter({ hasText: "Beta" }).first().dblclick();
    const rename = h.page.getByRole("textbox", { name: "Rename note" });
    await expect(rename).toBeFocused();
    await h.page.keyboard.type("Gamma");
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(rename).toBeFocused();
    await h.page.keyboard.press("Escape");
    await expect(rename).toBeHidden();

    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body more\n");
    expect(h.vault.exists("Beta.md")).toBe(true);
    await h.openNote("Alpha");
    expect(await noteText(h.page)).toBe("Alpha body more");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Escape closes only the topmost layer over the overlay sidebar", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n", "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Alpha");
    // Narrow enough that the sidebar leaves the layout and comes back as an overlay.
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(700, 800);
    });
    await expect.poll(() => h.page.evaluate(() => window.innerWidth)).toBe(700);
    const rows = h.page.locator("[data-note-id]");
    await expect(rows.first()).toBeHidden();
    await h.page.getByTitle("Show sidebar").click();
    await expect(rows.first()).toBeVisible();

    // A context menu over the overlay: Escape closes the menu, the panel stays.
    await rows.filter({ hasText: "Beta" }).click({ button: "right" });
    const menu = h.page.getByRole("menu");
    await expect(menu).toBeVisible();
    await h.page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(rows.first()).toBeVisible();

    // An inline rename over the overlay: Escape ends the rename, the panel stays.
    await rows.filter({ hasText: "Beta" }).dblclick();
    const rename = h.page.getByRole("textbox", { name: "Rename note" });
    await expect(rename).toBeFocused();
    await h.page.keyboard.press("Escape");
    await expect(rename).toBeHidden();
    await expect(rows.first()).toBeVisible();

    // With nothing above it, Escape is the overlay's.
    await h.page.keyboard.press("Escape");
    await expect(rows.first()).toBeHidden();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Cmd+N and Cmd+P do nothing while Settings is open; Escape closes it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await h.page.getByTestId("wordmark-settings-button").click();
    const settings = h.page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();

    await h.page.keyboard.press(`${MOD}+n`);
    await h.page.keyboard.press(`${MOD}+p`);
    await expect(settings).toBeVisible();
    await expect(h.page.getByRole("dialog", { name: "Search" })).toBeHidden();

    await h.page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    // The note behind Settings is the one that was open: no draft replaced it.
    await expect(title).toHaveText("Alpha");
    await expect(h.page.locator("[data-note-id]")).toHaveCount(1);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Cmd+K is the link editor and Cmd+P is Search", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body\n" });
  try {
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    await block.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Shift+ArrowLeft");
    await h.page.keyboard.press("Shift+ArrowLeft");

    const search = h.page.getByRole("dialog", { name: "Search" });
    const url = h.page.getByPlaceholder("https://...");
    await h.page.keyboard.press(`${MOD}+k`);
    await expect(url).toBeFocused();
    await expect(search).toBeHidden();
    await h.page.keyboard.press("Escape");
    await expect(url).toBeHidden();

    await h.page.keyboard.press(`${MOD}+p`);
    await expect(search).toBeVisible();
    await expect(url).toBeHidden();
    await h.page.keyboard.press("Escape");
    await expect(search).toBeHidden();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a typed tag keeps its space, and Enter after a complete or unknown tag is the editor's", async () => {
  const h = await launchApp({ "Alpha.md": "Has #alpha in it\n", "Beta.md": "Notes\n" });
  try {
    await h.openNote("Beta");
    const blocks = h.page.locator("[data-block-id]");
    const menu = h.page.getByRole("listbox", { name: "Tag suggestions" });
    // A file ending in a newline opens with an empty last row after the text.
    const before = await blocks.count();
    await blocks.first().click();
    await h.page.keyboard.press(END_OF_LINE);

    // The space that ends a tag is typed, not eaten.
    await h.page.keyboard.type(" #alpha");
    await expect(menu).toBeVisible();
    await h.page.keyboard.type(" beta");
    await expect(menu).toBeHidden();
    expect(await noteText(h.page)).toBe("Notes #alpha beta");

    // Enter after a tag typed in full: the menu shows the same tag, and Enter
    // starts a new paragraph rather than "completing" what is complete.
    await h.page.keyboard.type(" #alpha");
    await expect(menu).toBeVisible();
    await h.page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(blocks).toHaveCount(before + 1);

    // Enter after a tag nothing matches: no menu shows, and Enter is the editor's.
    await h.page.keyboard.type("#brandnew");
    await expect(menu).toBeHidden();
    await h.page.keyboard.press("Enter");
    await expect(blocks).toHaveCount(before + 2);

    await waitForFile(h.vault.file("Beta.md"), (t) => t.includes("#brandnew"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Beta.md")).toMatch(/^Notes #alpha beta #alpha\n\n#brandnew\n+$/);
    expect(await noteText(h.page)).toBe("Notes #alpha beta #alpha\n#brandnew");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Rename from the row's ··· menu opens the field with focus and renames the file", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const row = h.page.locator("[data-note-id]").filter({ hasText: "Alpha" });
    await row.hover();
    await row.getByRole("button", { name: "Note actions" }).click();
    await h.page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = h.page.getByRole("textbox", { name: "Rename note" });
    await expect(rename).toBeFocused();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Renamed");
    await h.page.keyboard.press("Enter");
    await expect(rename).toBeHidden();
    await expect.poll(() => h.vault.exists("Renamed.md")).toBe(true);
    expect(h.vault.exists("Alpha.md")).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
