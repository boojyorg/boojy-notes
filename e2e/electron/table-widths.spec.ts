/**
 * A table tighter than its content wraps running text at its words and keeps
 * short columns on one line. Before, every cell could break at any letter, so
 * a tight table squeezed all its columns alike and cut COMP201 into COMP20 / 1.
 * Needs the real app: the widths are Chromium's table layout.
 */
import { expect, type Page, test } from "@playwright/test";
import { launchApp } from "./harness";

const NOTE = [
  "| Module | Title | Credits | Overall mark | Result |",
  "| --- | --- | ---: | ---: | --- |",
  "| COMP201 | Software Engineering I | 15 | 74% | Pass (Resit) |",
  "| COMP219 | Advanced Artificial Intelligence | 15 | 77% | Pass (Resit) |",
  "| COMP285 | Computer Aided Software Development | 7.5 | 82% | Pass |",
  "",
].join("\n");

/** Each cell's text and the number of lines it is drawn on. */
const cellLines = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("table.table-block th, table.table-block td")].map(
      (cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        return { text: cell.textContent ?? "", lines: tops.size };
      },
    ),
  );

test("a tight table wraps its running text at words and keeps short columns on one line", async () => {
  const h = await launchApp({ "Results.md": NOTE });
  try {
    // Narrow enough that the table's content is wider than the text column.
    await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 700));
    await h.openNote("Results");
    const table = h.page.locator("table.table-block");
    await expect(table).toBeVisible();
    const column = await h.page
      .locator(".table-outer")
      .evaluate((el) => el.parentElement?.clientWidth ?? 0);
    expect(await table.evaluate((t) => t.scrollWidth)).toBeLessThanOrEqual(column);

    const cells = await cellLines(h.page);
    const lines = (text: string) => cells.find((c) => c.text === text)?.lines;
    // Short columns: one line each (before: COMP20 / 1, Credit / s).
    for (const text of ["Module", "COMP201", "Credits", "Overall mark", "74%", "Pass (Resit)"])
      expect(lines(text), text).toBe(1);
    // The running text takes the wrapping, at its words.
    expect(lines("Computer Aided Software Development")).toBeGreaterThan(1);
    // No word is split across lines, in any cell.
    const split = await h.page.evaluate(() => {
      const out: string[] = [];
      for (const cell of document.querySelectorAll("table.table-block th, table.table-block td")) {
        const node = [...cell.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        const text = node?.textContent ?? "";
        let at = 0;
        for (const word of text.split(" ")) {
          const range = document.createRange();
          range.setStart(node as Node, at);
          range.setEnd(node as Node, at + word.length);
          if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1)
            out.push(word);
          at += word.length + 1;
        }
      }
      return out;
    });
    expect(split).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
