/**
 * A table keeps what its file holds. Editing one cell rewrites that cell's row
 * and nothing else; editing prose beside a table leaves the table alone.
 *
 * Ragged on disk, ragged forever: a row keeps exactly the cells its line holds
 * through an open, an edit, a save and a restart, and the grid is drawn as
 * wide as the widest row. Only an explicit column operation pads: adding a
 * column makes the next visual column in every row, a short row included.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Prices.md";
const lines = [
  "Intro.",
  "",
  "| Name    | Amount |",
  "|:--------|-------:|",
  "| Coffee  |   3.20 |",
  "| Tea     |   2.10 |",
  "|[[Menu|the menu]]|see|",
  "",
  "Outro.",
  "",
];

test("editing one cell rewrites only its row; the rest of the table keeps its spacing", async () => {
  const h = await launchApp({ [NOTE]: lines.join("\n") });
  try {
    await h.openNote("Prices");
    const cell = h.page.locator("table.table-block td", { hasText: "2.10" });
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("5");

    const expected = [...lines];
    expected[5] = "| Tea | 2.105 |";
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("2.105"));
    expect(h.vault.read(NOTE)).toBe(expected.join("\n"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("editing prose beside a table leaves every table line as written", async () => {
  const h = await launchApp({ [NOTE]: lines.join("\n") });
  try {
    await h.openNote("Prices");
    await h.page.locator("[data-block-type='p']", { hasText: "Outro." }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" More.");

    const expected = [...lines];
    expected[8] = "Outro. More.";
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("More."));
    expect(h.vault.read(NOTE)).toBe(expected.join("\n"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

const ragged = [
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
  const h = await launchApp({ "Ragged.md": ragged });
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
    expect(h.vault.read("Ragged.md")).toBe(ragged.replace("Intro line.", "Intro line. Edited"));

    await h.restart();
    await h.openNote("Ragged");
    expect(await h.page.locator("table.table-block thead th").count()).toBe(3);
    expect(
      await h.page.locator("table.table-block tbody tr").nth(0).locator("td").allTextContents(),
    ).toEqual(["Tea", "2", "extra"]);
    expect(h.vault.read("Ragged.md")).toBe(ragged.replace("Intro line.", "Intro line. Edited"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("adding a column makes the next visual column in every row, padding a short row up to it", async () => {
  const h = await launchApp({ "Ragged.md": ragged });
  try {
    await h.openNote("Ragged");
    const table = h.page.locator("table.table-block");
    await expect(table).toBeVisible();
    await table.hover();
    await h.page.locator(".table-right-zone").click({ force: true });
    await expect(table.locator("thead th")).toHaveCount(4);

    await waitForFile(h.vault.file("Ragged.md"), (t) => t.includes("| --- | --- | --- | --- |"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Ragged.md")).toBe(
      [
        "Intro line.",
        "",
        // The header is a short row too: padded like the rest, its new cell empty.
        "| Name | Qty |  |  |",
        "| --- | --- | --- | --- |",
        "| Tea | 2 | extra |  |",
        "| Milk |  |  |  |",
        "| Bread | 1 |  |  |",
        "",
      ].join("\n"),
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
