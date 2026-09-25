/**
 * A table's rows and columns are moved and arranged from grips on its edges
 * (TableHandles). A row's grip shows from its first cell or the margin beside
 * it, a column's from its header cell. A drag writes one change on the drop,
 * one Cmd+Z undoes it, and the file keeps every line it was written with: a
 * moved row is its own line in its new place, a new alignment rewrites only
 * the separator, keeping the other columns' spelling.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Prices.md";
const lines = [
  "Intro.",
  "",
  "| Name    | Amount |",
  "|:--------|-------:|",
  "| Coffee  |   3.20 |",
  "| Tea     |   2.10 |",
  "| Cake    |   4.00 |",
  "",
];

type Harness = Awaited<ReturnType<typeof launchApp>>;

const cell = (h: Harness, row: number, col: number) =>
  h.page.locator("table.table-block tr").nth(row).locator("th, td").nth(col);

/** Carry a row by its grip `rows` rows down (negative: up), by real pointer moves. */
async function dragRow(h: Harness, row: number, by: number) {
  await cell(h, row, 0).hover();
  const grip = h.page.getByRole("button", { name: "Row options, or drag to move", exact: true });
  const box = await grip.boundingBox();
  const height = (await cell(h, row, 0).boundingBox())?.height ?? 0;
  if (!box) throw new Error("no row grip");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await h.page.mouse.move(x, y);
  await h.page.mouse.down();
  await h.page.mouse.move(x, y + 8, { steps: 2 });
  // Just past half a row per place: the carried row's leading edge decides.
  await h.page.mouse.move(x, y + by * height * 0.6 + Math.sign(by) * 2, { steps: 6 });
  await h.page.mouse.up();
}

test("a row's grip shows from its first cell, and a drag moves the row, its line kept; Cmd+Z puts it back", async () => {
  const h = await launchApp({ [NOTE]: lines.join("\n") });
  try {
    await h.openNote("Prices");
    const rowGrip = h.page.getByRole("button", {
      name: "Row options, or drag to move",
      exact: true,
    });
    const colGrip = h.page.getByRole("button", {
      name: "Column options, or drag to move",
      exact: true,
    });

    // A middle cell shows no grips; the first column shows its row's only.
    await cell(h, 2, 1).hover();
    await expect(rowGrip).toHaveCount(0);
    await expect(colGrip).toHaveCount(0);
    await cell(h, 2, 0).hover();
    await expect(rowGrip).toHaveCount(1);
    await expect(colGrip).toHaveCount(0);

    await dragRow(h, 1, 1);
    await expect(cell(h, 1, 0)).toHaveText("Tea");
    await waitForFile(h.vault.file(NOTE), (t) => t.indexOf("Tea") < t.indexOf("Coffee"));
    await sleep(SETTLE_MS);
    const moved = [...lines];
    [moved[4], moved[5]] = [lines[5], lines[4]];
    expect(h.vault.read(NOTE)).toBe(moved.join("\n"));

    await cell(h, 2, 1).click();
    await h.page.keyboard.press("ControlOrMeta+z");
    await expect(cell(h, 1, 0)).toHaveText("Coffee");
    await waitForFile(h.vault.file(NOTE), (t) => t === lines.join("\n"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the header row has a grip too: carried down, the row under it becomes the header", async () => {
  const h = await launchApp({ [NOTE]: lines.join("\n") });
  try {
    await h.openNote("Prices");
    await dragRow(h, 0, 1);
    await expect(cell(h, 0, 0)).toHaveText("Coffee");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("| Coffee  |   3.20 |\n|:---"));
    const moved = [...lines];
    moved[2] = lines[4];
    moved[4] = lines[2];
    expect(h.vault.read(NOTE)).toBe(moved.join("\n"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a column's grip opens its menu; Align centre rewrites only the separator and keeps the menu open", async () => {
  const h = await launchApp({ [NOTE]: lines.join("\n") });
  try {
    await h.openNote("Prices");
    await cell(h, 0, 0).hover();
    await h.page
      .getByRole("button", { name: "Column options, or drag to move", exact: true })
      .click();
    const menu = h.page.getByRole("menu", { name: "Column options" });
    await expect(menu).toBeVisible();
    await expect(h.page.locator(".table-selection-outline")).toHaveCount(1);

    await menu.getByRole("menuitemradio", { name: "Align centre" }).click();
    await expect(menu).toBeVisible();
    await expect(cell(h, 1, 0)).toHaveCSS("text-align", "center");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("| :---: | -------: |"));
    const aligned = [...lines];
    aligned[3] = "| :---: | -------: |";
    expect(h.vault.read(NOTE)).toBe(aligned.join("\n"));

    await h.page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(h.page.locator(".table-selection-outline")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
