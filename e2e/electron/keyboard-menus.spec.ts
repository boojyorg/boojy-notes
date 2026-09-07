/**
 * Keyboard and menu correctness in the built desktop app: three review
 * findings (2026-09-06, H2–H4) where a key or a click did something other
 * than what the user saw.
 *
 * - Tab / Shift+Tab on a list item re-indented it but sent the caret to the
 *   start of the item, so the next characters landed in front of the text.
 * - Enter on a tag suggestion split the block instead of completing the tag:
 *   the menu prevented the key's default but the editor's own Enter handler
 *   still ran on the DOM text.
 * - Clicking an inline `#tag` opened the search palette with the query but
 *   left focus in the editor, so Escape did nothing and the arrows moved the
 *   caret rather than the highlighted result.
 *
 * Each case asserts what the user reads and what reached the disk.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, noteText, sleep, waitForFile } from "./harness";

test("Tab and Shift+Tab re-indent a list item and keep the caret where it was", async () => {
  const h = await launchApp({ "List.md": "- item one\n- item two\n" });
  try {
    await h.openNote("List");
    await h.page.locator("[data-block-id]").nth(1).click();
    await h.page.keyboard.press(END_OF_LINE);

    // Caret at the end: Tab indents, the next character still lands at the end.
    await h.page.keyboard.press("Tab");
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("List.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("List.md")).toBe("- item one\n  - item twoX\n");

    // Shift+Tab outdents; the caret is still at the end.
    await h.page.keyboard.press("Shift+Tab");
    await h.page.keyboard.type("Y");
    await waitForFile(h.vault.file("List.md"), (t) => t.includes("Y"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("List.md")).toBe("- item one\n- item twoXY\n");

    // Caret in the middle of the text: Tab keeps that offset too.
    await h.page.keyboard.press("ArrowLeft");
    await h.page.keyboard.press("ArrowLeft");
    await h.page.keyboard.press("Tab");
    await h.page.keyboard.type("Z");
    await waitForFile(h.vault.file("List.md"), (t) => t.includes("Z"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("List.md")).toBe("- item one\n  - item twoZXY\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Enter on a tag suggestion completes the tag in place and splits nothing", async () => {
  const h = await launchApp({ "Alpha.md": "Has #review in it\n", "Beta.md": "Notes\n" });
  try {
    await h.openNote("Beta");
    const blocksBefore = await h.page.locator("[data-block-id]").count();
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" #rev");
    const menu = h.page.getByRole("listbox", { name: "Tag suggestions" });
    await expect(menu.getByRole("option", { name: "#review" })).toBeVisible();
    await h.page.keyboard.press("Enter");
    await expect(menu).toBeHidden();

    await waitForFile(h.vault.file("Beta.md"), (t) => t.includes("#review"));
    await sleep(SETTLE_MS);
    expect(await h.page.locator("[data-block-id]").count()).toBe(blocksBefore);
    expect(h.vault.read("Beta.md")).toBe("Notes #review \n");
    // innerText drops the collapsed trailing space; the tag is there and whole.
    expect(await noteText(h.page)).toMatch(/^Notes #review ?$/);
    // The caret stayed after the completed tag: typing continues the line.
    await h.page.keyboard.type("done");
    await waitForFile(h.vault.file("Beta.md"), (t) => t.includes("done"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Beta.md")).toBe("Notes #review done\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a tag click opens the search palette with focus, Escape closes it, and the keys navigate as after Cmd+K", async () => {
  const h = await launchApp({
    "Alpha.md": "Tagged #review here\n",
    "Beta.md": "Beta has #review too\n",
  });
  try {
    await h.openNote("Alpha");
    const dialog = h.page.getByRole("dialog", { name: "Search" });
    const field = h.page.getByRole("textbox", { name: "Search notes" });

    // The click opens the palette with the query and the field focused.
    await h.page.locator("[data-block-id] .inline-tag").first().click();
    await expect(dialog).toBeVisible();
    await expect(field).toHaveValue("#review");
    await expect(field).toBeFocused();
    await h.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Which note ArrowDown + Enter opens after Cmd+K with the same query.
    // Results follow the search's own debounce; the keys wait for them, as a
    // user does, in both paths.
    const rows = dialog.locator("[data-search-index]");
    await h.page.keyboard.press(`${MOD}+k`);
    await expect(field).toBeFocused();
    await h.page.keyboard.type("#review");
    await expect(rows).toHaveCount(2);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    const viaShortcut = await h.page.getByRole("textbox", { name: "Note title" }).innerText();

    // The same keys after a tag click open the same note.
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id] .inline-tag").first().click();
    await expect(field).toBeFocused();
    await expect(rows).toHaveCount(2);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    expect(await h.page.getByRole("textbox", { name: "Note title" }).innerText()).toBe(viaShortcut);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
