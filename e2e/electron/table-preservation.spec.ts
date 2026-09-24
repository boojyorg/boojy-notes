/**
 * A table keeps the lines it was written with (2026-09-24). The first save of
 * a note used to rewrite every table not already in the app's spelling: on a
 * copy of a real Obsidian vault, 82 of 202 notes changed on a load and save
 * with no edit (padding collapsed, `|---|` spaced out, `[[Note|alias]]` split
 * at its pipe). Now editing one cell rewrites that cell's row and nothing
 * else in the file, and editing prose beside a table leaves the table alone.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, launchApp, waitForFile } from "./harness";

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
