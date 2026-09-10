/**
 * A table is a block you can address, enter and leave (2026-09-10). Before
 * this it could not be removed from a note: Backspace at the start of the
 * paragraph below stepped over it and deleted that paragraph into the one
 * above, forward Delete above it was refused, the cell menu had no Delete
 * table, and the header row and last column were undeletable. It also filled
 * the editor column the moment it appeared, and no key led into it from a
 * paragraph.
 *
 * Now: a new table is a small grid; its add bars show while a cell has focus;
 * Escape from a cell selects the whole table (the divider's band) and
 * Backspace removes it, Cmd+Z brings it back; a Backspace or forward Delete
 * arriving from a neighbour selects it and keeps the neighbour; Delete table
 * in the cell menu does the same; and the arrows walk in from the paragraph
 * above, through the cells and out at the last row.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  START_OF_LINE,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Grid.md";
// Prose tight against the table on both sides: a blank line beside a table is
// an empty paragraph row in the paragraph model, and these tests are about the
// table's own neighbours.
const seeded = ["Above.", "| Name | Qty |", "| --- | --- |", "| Tea | 2 |", "Below.", ""].join(
  "\n",
);

const table = (h: Awaited<ReturnType<typeof launchApp>>) => h.page.locator("table.table-block");
const selectedTable = (h: Awaited<ReturnType<typeof launchApp>>) =>
  h.page.locator("[data-block-type='table'][data-selected='true']");
const paragraph = (h: Awaited<ReturnType<typeof launchApp>>, text: string) =>
  h.page.locator("[data-block-type='p']", { hasText: text });

test("a typed ||| makes a small grid whose bars show while a cell has focus; Escape then Backspace removes it, Cmd+Z brings it back", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Grid");
    await paragraph(h, "Intro.").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("|||");
    await expect(table(h).locator("th").first()).toBeFocused();

    // Content-sized: an empty 2×2 is a small grid at the column's left, not
    // the column's width; the focused cell wears no ring; the add boxes are
    // there past the right and bottom edges (their reveal is the box's own
    // CSS hover, not something a hidden window can be asked about).
    const widths = await h.page.evaluate(() => {
      const width = (sel: string) =>
        document.querySelector(sel)?.getBoundingClientRect().width ?? -1;
      const th = document.querySelector("table.table-block th");
      return {
        table: width("table.table-block"),
        column: width("[data-block-type='p']"),
        cellFocused: document.querySelector(".table-outer")?.matches(":focus-within") ?? null,
        bars: document.querySelectorAll(".table-outer .table-add-bar").length,
        ring: th ? getComputedStyle(th).boxShadow : null,
      };
    });
    expect(widths.table).toBeGreaterThan(0);
    expect(widths.table).toBeLessThan(widths.column / 2);
    expect(widths.cellFocused).toBe(true);
    expect(widths.bars).toBe(2);
    expect(widths.ring).toBe("none");

    await h.page.keyboard.type("Name");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("| Name |"));

    // Escape selects the whole table; Backspace removes it and the caret
    // lands in the paragraph under it.
    await h.page.keyboard.press("Escape");
    await expect(selectedTable(h)).toHaveCount(1);
    expect(
      await h.page.evaluate(
        () => document.querySelector(".table-outer")?.matches(":focus-within") ?? null,
      ),
    ).toBe(false);
    await h.page.keyboard.press("Backspace");
    await expect(table(h)).toHaveCount(0);
    // The caret lands in the paragraph the table left behind, the one right
    // under Intro. (the seed's final newline is an empty last row after it).
    await h.page.keyboard.type("tail");
    await expect(h.page.locator("[data-block-type='p']").nth(1)).toHaveText("tail");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("tail"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe("Intro.\n\ntail\n");

    // Cmd+Z: the table is back with its cell, on screen and on disk.
    await h.page.keyboard.press(`${MOD}+z`);
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(table(h)).toHaveCount(1);
    await expect(table(h).locator("th").first()).toHaveText("Name");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("| Name |"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Backspace from below and forward Delete from above select the table and keep the neighbour; the arrows walk in, through and out", async () => {
  const h = await launchApp({ [NOTE]: seeded });
  try {
    await h.openNote("Grid");
    await expect(table(h)).toBeVisible();

    // Backspace at the start of the paragraph below: the table is selected
    // and the paragraph stays (before this, the paragraph was deleted into
    // the one above the table).
    await paragraph(h, "Below.").click();
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("Backspace");
    await expect(selectedTable(h)).toHaveCount(1);
    await expect(paragraph(h, "Below.")).toHaveCount(1);
    await h.page.keyboard.press("Escape");
    await expect(selectedTable(h)).toHaveCount(0);

    // Forward Delete at the end of the paragraph above: the same.
    await paragraph(h, "Above.").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Delete");
    await expect(selectedTable(h)).toHaveCount(1);
    await expect(paragraph(h, "Above.")).toHaveCount(1);
    await h.page.keyboard.press("Escape");

    // ArrowDown from the paragraph above enters the first cell; Right walks
    // the row; Down walks the column; Down from the last row leaves to the
    // paragraph below, at its start.
    await paragraph(h, "Above.").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("ArrowDown");
    await expect(table(h).locator("th").nth(0)).toBeFocused();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("ArrowRight");
    await expect(table(h).locator("th").nth(1)).toBeFocused();
    await h.page.keyboard.press("ArrowDown");
    await expect(table(h).locator("td").nth(1)).toBeFocused();
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.type("X");
    await expect(paragraph(h, "XBelow.")).toHaveCount(1);
    // ArrowUp from the paragraph below enters the last row.
    await h.page.keyboard.press("ArrowUp");
    await expect(table(h).locator("td").nth(0)).toBeFocused();

    await waitForFile(h.vault.file(NOTE), (t) => t.includes("XBelow."));
    await sleep(SETTLE_MS);
    const written = h.vault.read(NOTE);
    expect(written).toContain("Above.\n");
    expect(written).toContain("| Name | Qty |\n| --- | --- |\n| Tea | 2 |\n");
    expect(written).toContain("XBelow.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Delete table from the cell menu removes the whole block, and an added column is empty", async () => {
  const h = await launchApp({ [NOTE]: seeded });
  try {
    await h.openNote("Grid");
    await expect(table(h)).toBeVisible();

    // An added column carries no label into the file.
    await table(h).locator("td").first().click();
    await h.page.locator(".table-right-zone").click({ force: true });
    await expect(table(h).locator("th")).toHaveCount(3);
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("| --- | --- | --- |"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("| Name | Qty |  |\n| --- | --- | --- |\n| Tea | 2 |  |");
    expect(h.vault.read(NOTE)).not.toContain("Col ");

    await table(h).locator("td").first().click({ button: "right" });
    const menu = h.page.locator(".table-context-menu");
    await expect(menu).toBeVisible();
    await menu.getByText("Delete table").click();
    await expect(table(h)).toHaveCount(0);
    await expect(menu).toHaveCount(0);
    // The caret lands in the paragraph under where the table was.
    await h.page.keyboard.type("Y");
    await expect(paragraph(h, "YBelow.")).toHaveCount(1);

    await waitForFile(h.vault.file(NOTE), (t) => !t.includes("|"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe("Above.\n\nYBelow.\n");
    expect(h.pageErrors).toEqual([]);
    // Cmd+Z brings the table back, cells and all.
    await h.page.keyboard.press(`${MOD}+z`);
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(table(h)).toHaveCount(1);
    await expect(table(h).locator("td").first()).toHaveText("Tea");
  } finally {
    await h.close();
  }
});
