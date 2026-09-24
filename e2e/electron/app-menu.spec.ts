/**
 * The menu bar is every command with its shortcut (2026-09-24,
 * electron/appMenu.ts). An item runs what its key runs, through the window,
 * and greys when it cannot act. Undo and Redo left the top row for Edit.
 *
 * Items are clicked here through the main process (`MenuItem.click`), the path
 * a pointer takes; a real keypress reaching a menu accelerator cannot be sent
 * to a hidden window, so the keys stay the editor's own specs' to prove.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SELECT_WORD_LEFT,
  launchApp,
  menuClick,
  menuEnabled,
  waitForFile,
} from "./harness";

const click = menuClick;
const enabled = menuEnabled;
const item = (h: Awaited<ReturnType<typeof launchApp>>, id: string) =>
  h.app.evaluate(({ Menu }, id) => {
    const it = Menu.getApplicationMenu()?.getMenuItemById(id);
    return it ? { checked: it.checked, label: it.label, sublabel: it.sublabel } : null;
  }, id);
const checked = async (h: Awaited<ReturnType<typeof launchApp>>, id: string) =>
  (await item(h, id))?.checked ?? null;

test("Format turns the line into a heading, Edit → Undo takes it back, and Undo greys when there is nothing to undo", async () => {
  const h = await launchApp({ "Alpha.md": "First line.\n\nSecond line.\n" });
  try {
    await h.openNote("Alpha");
    await expect.poll(() => enabled(h, "undo")).toBe(false);
    await expect.poll(() => enabled(h, "bold")).toBe(true);

    await h.page.locator("[data-block-id]", { hasText: "Second line." }).click();
    await click(h, "h2");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("## Second line."));
    // The blank line between the two blocks is structure and stays one.
    expect(h.vault.read("Alpha.md")).toBe("First line.\n\n## Second line.\n");
    await expect.poll(() => enabled(h, "undo")).toBe(true);
    // The caret's line is a Heading 2 now; the menu checks it and teaches its Markdown.
    await expect.poll(() => checked(h, "h2")).toBe(true);
    if (process.platform === "darwin") {
      expect((await item(h, "h2"))?.sublabel).toBe("Type ## and a space");
    }

    await click(h, "undo");
    await waitForFile(h.vault.file("Alpha.md"), (t) => !t.includes("##"));
    expect(h.vault.read("Alpha.md")).toBe("First line.\n\nSecond line.\n");

    // The top row no longer carries the history pair.
    await expect(h.page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Format → Bold bolds the selected words, as Cmd+B does", async () => {
  const h = await launchApp({ "Alpha.md": "Hello world\n" });
  try {
    await h.openNote("Alpha");
    const line = h.page.locator("[data-block-id]", { hasText: "Hello world" });
    await line.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press(SELECT_WORD_LEFT);
    await click(h, "bold");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("**world**"));
    expect(h.vault.read("Alpha.md")).toBe("Hello **world**\n");
    // The selection holds bold now, so Bold carries a check (Pages' way,
    // rather than renaming itself Unbold), and the line is Text.
    await expect.poll(() => checked(h, "bold")).toBe(true);
    expect(await checked(h, "italic")).toBe(false);
    expect(await checked(h, "body")).toBe(true);
  } finally {
    await h.close();
  }
});

test("File → Duplicate, and Edit → Find and Find and Replace open the find bar", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await click(h, "replace");
    await expect(h.page.getByPlaceholder("Replace with...")).toBeVisible();
    // Cmd+F closes it and opens it again as it was left, Replace showing.
    await h.page.getByPlaceholder("Find in note...").press("Escape");
    await expect(h.page.getByPlaceholder("Find in note...")).toHaveCount(0);
    await click(h, "find");
    await expect(h.page.getByPlaceholder("Replace with...")).toBeVisible();

    await click(h, "duplicate");
    await expect.poll(() => h.vault.list()).toEqual(["Alpha (copy).md", "Alpha.md"]);
  } finally {
    await h.close();
  }
});

test("on a blank draft the file's items grey out, and Format and Rename stay", async () => {
  // An empty vault opens on a draft: a note with no file until its first keystroke.
  const h = await launchApp({});
  try {
    await expect.poll(() => enabled(h, "duplicate")).toBe(false);
    for (const id of ["moveTo", "reveal", "trash"]) expect(await enabled(h, id)).toBe(false);
    for (const id of ["rename", "h1", "bold", "newNote"]) expect(await enabled(h, id)).toBe(true);
  } finally {
    await h.close();
  }
});

test("View says Hide Sidebar or Show Sidebar, whichever it will do", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await expect.poll(async () => (await item(h, "toggleSidebar"))?.label).toBe("Hide Sidebar");
    await click(h, "toggleSidebar");
    await expect.poll(async () => (await item(h, "toggleSidebar"))?.label).toBe("Show Sidebar");
  } finally {
    await h.close();
  }
});
