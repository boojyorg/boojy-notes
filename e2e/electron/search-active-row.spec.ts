/**
 * The search palette's highlighted row is the row Enter opens (review
 * 2026-09-07, §4.3). Keyboard order, rendered order and the active index are
 * one source of truth: the position in the result list as it is drawn.
 *
 * Before this, results were also grouped by folder (root first, folders
 * alphabetically) and each result was stamped with its position in *that*
 * order, while the palette drew score order and Enter read score order. Any
 * hit inside a folder put the highlight on one row and opened another, and
 * the arrows moved the highlight non-monotonically.
 */
import { expect, test } from "@playwright/test";
import { MOD, editorTitle, launchApp } from "./harness";

test("the highlighted row is the row Enter opens, and the arrows walk the list in order", async () => {
  // Score order: the title hit in the folder first, the root body hit second.
  // Group order would put the root note first.
  const h = await launchApp({
    "Notes.md": "The plan is simple.\n",
    "Work/Plan.md": "Plan body.\n",
  });
  try {
    await h.page.keyboard.press(`${MOD}+p`);
    const field = h.page.getByRole("textbox", { name: "Search notes" });
    await expect(field).toBeFocused();
    await field.type("plan");
    const rows = h.page.locator("[data-search-index]");
    await expect(rows).toHaveCount(2);
    const rowTitles = async () =>
      Promise.all((await rows.all()).map((r) => r.locator("span > span").first().innerText()));
    expect(await rowTitles()).toEqual(["Plan", "Notes"]);

    // Opening resets to the first row drawn.
    const current = h.page.locator('[data-search-index][aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(/Plan/);
    expect(await current.getAttribute("data-search-index")).toBe("0");

    // ArrowDown moves to the second row drawn, ArrowUp back to the first.
    await h.page.keyboard.press("ArrowDown");
    await expect(current).toHaveText(/Notes/);
    expect(await current.getAttribute("data-search-index")).toBe("1");
    await h.page.keyboard.press("ArrowUp");
    await expect(current).toHaveText(/Plan/);

    // Enter opens the highlighted row.
    await h.page.keyboard.press("ArrowDown");
    await expect(current).toHaveText(/Notes/);
    await h.page.keyboard.press("Enter");
    await expect(h.page.getByRole("dialog", { name: "Search" })).toBeHidden();
    await expect.poll(() => editorTitle(h.page)).toBe("Notes");

    // And the first row, when it is the one highlighted.
    await h.page.keyboard.press(`${MOD}+p`);
    await field.type("plan");
    await expect(rows).toHaveCount(2);
    await expect(current).toHaveText(/Plan/);
    await h.page.keyboard.press("Enter");
    await expect.poll(() => editorTitle(h.page)).toBe("Plan");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
