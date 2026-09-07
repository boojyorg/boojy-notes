/**
 * Ragged tables: a row with more cells than its header, or fewer, keeps
 * exactly the cells its line holds through an open, an edit elsewhere in the
 * note, a save and a restart. Reproduces review finding H9 (2026-09-06): the
 * extra cells of a wide row were sliced off on parse, so any save wrote the
 * row back without them, and a short row was padded to the header.
 *
 * On screen the grid is as wide as the widest row; adding a column through
 * the table's own control appends a cell to every row, the wide one included.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const source = [
  "Intro line.",
  "",
  "| Name | Qty |",
  "| --- | --- |",
  "| Tea | 2 | extra |",
  "| Milk |",
  "| Bread | 1 |",
  "",
].join("\n");

test("a wide row keeps its extra cells and a short row stays short through an edit, a save and a restart", async () => {
  const h = await launchApp({ "Ragged.md": source });
  try {
    await h.openNote("Ragged");
    const table = h.page.locator("table.table-block");
    await expect(table).toBeVisible();
    // The grid is drawn to the widest row: three columns, the header included.
    expect(await table.locator("thead th").count()).toBe(3);
    expect(await table.locator("tbody tr").nth(0).locator("td").allTextContents()).toEqual([
      "Tea",
      "2",
      "extra",
    ]);
    expect(await table.locator("tbody tr").nth(1).locator("td").allTextContents()).toEqual([
      "Milk",
      "",
      "",
    ]);

    // An edit elsewhere in the note saves the whole file; the table's bytes must not move.
    const intro = h.page.locator('[data-block-id][data-block-type="p"]').first();
    await intro.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited");
    await waitForFile(h.vault.file("Ragged.md"), (t) => t.includes("Edited"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Ragged.md")).toBe(source.replace("Intro line.", "Intro line. Edited"));

    await h.restart();
    await h.openNote("Ragged");
    expect(await h.page.locator("table.table-block thead th").count()).toBe(3);
    expect(
      await h.page.locator("table.table-block tbody tr").nth(0).locator("td").allTextContents(),
    ).toEqual(["Tea", "2", "extra"]);
    expect(h.vault.read("Ragged.md")).toBe(source.replace("Intro line.", "Intro line. Edited"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("adding a column appends a cell to every row, the already-wide row included", async () => {
  const h = await launchApp({ "Ragged.md": source });
  try {
    await h.openNote("Ragged");
    const table = h.page.locator("table.table-block");
    await expect(table).toBeVisible();
    await table.hover();
    await h.page.locator(".table-right-zone").click({ force: true });
    await expect(table.locator("thead th")).toHaveCount(4);

    await waitForFile(h.vault.file("Ragged.md"), (t) => t.includes("Col 4"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Ragged.md")).toBe(
      [
        "Intro line.",
        "",
        "| Name | Qty | Col 4 |",
        "| --- | --- | --- |",
        "| Tea | 2 | extra |  |",
        "| Milk |  |",
        "| Bread | 1 |  |",
        "",
      ].join("\n"),
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
