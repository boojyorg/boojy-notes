import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, type AppHandle } from "./harness";

/**
 * The foot of a note's ··· menu, the header's and a sidebar row's: the note's
 * words, grouped as the system groups digits, and when it was last edited, how
 * recently while fresh, then the day and clock. It takes the menu's width and
 * never sets it: a long one drops its second half onto a line of its own.
 */

const LONG = `${"word ".repeat(23421).trim()}\n`;

function yesterdayAt(h: number, m: number) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d;
}

async function headerMenu(h: AppHandle) {
  await h.page.locator("button[aria-label='Note actions']").click();
  const menu = h.page.getByRole("menu", { name: "Note actions" });
  await expect(menu).toBeVisible();
  return menu;
}

test("a note last edited yesterday says so, in the header's menu and its row's", async () => {
  const h = await launchApp({ "Old.md": "Three words here.\n", "Other.md": "Two words.\n" });
  try {
    const when = yesterdayAt(21, 40);
    fs.utimesSync(h.vault.file("Old.md"), when, when);
    fs.utimesSync(h.vault.file("Other.md"), when, when);
    await h.restart();
    await h.openNote("Old");

    const menu = await headerMenu(h);
    await expect(menu.getByTestId("note-words")).toHaveText("3 words");
    await expect(menu.getByTestId("note-edited")).toHaveText(/^Edited yesterday at \d/);
    await h.page.keyboard.press("Escape");

    // Another note's row: its own count.
    await h.page.getByRole("treeitem", { name: /Other/ }).click({ button: "right" });
    const rowMenu = h.page.getByRole("menu");
    await expect(rowMenu.getByTestId("note-words")).toHaveText("2 words");
    await expect(rowMenu.getByTestId("note-edited")).toHaveText(/^Edited yesterday at \d/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the footer is always one line, the menu widening for a long one", async () => {
  const h = await launchApp({ "Short.md": "Hi.\n", "Long.md": LONG });
  try {
    const when = yesterdayAt(21, 40);
    fs.utimesSync(h.vault.file("Long.md"), when, when);
    await h.restart();

    // A row's menu is the narrow one (no shortcuts), where a split showed first.
    for (const name of ["Short", "Long"]) {
      await h.page.getByRole("treeitem", { name: new RegExp(name) }).click({ button: "right" });
      const menu = h.page.getByRole("menu");
      const words = await menu.getByTestId("note-words").boundingBox();
      const edited = await menu.getByTestId("note-edited").boundingBox();
      const box = await menu.boundingBox();
      expect(edited?.y, name).toBeCloseTo(words?.y ?? 0, 0);
      expect((edited?.x ?? 0) + (edited?.width ?? 0), name).toBeLessThanOrEqual(
        (box?.x ?? 0) + (box?.width ?? 0),
      );
      await h.page.keyboard.press("Escape");
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
