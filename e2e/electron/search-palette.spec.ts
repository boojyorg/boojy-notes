/**
 * The search palette as one list with three faces (2026-09-20):
 *
 * - Empty, it lists the notes opened most recently, the open note left out,
 *   under a `Recent` label; Enter on the first is the way back.
 * - The desktop sidebar never changes behind it: no filtering, no folder
 *   opened or closed, whatever is typed.
 * - Enter straight after typing acts on the query as typed, not on the
 *   results of the keystroke before (the debounce is flushed).
 * - `#` lists tags as rows; Enter makes the chosen tag the filter chip and
 *   lists the notes carrying exactly that tag; text then searches within
 *   them; Backspace on the empty field puts the tag back as text; Escape
 *   closes in one press and the next open starts fresh.
 * - A body hit opens the note at the matched passage.
 */
import { expect, test } from "@playwright/test";
import { MOD, editorTitle, launchApp, sidebarNoteTitles } from "./harness";

const filler = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of padding.`).join("\n\n");

test("recents, an unchanged sidebar, Enter after typing, and the tag chip", async () => {
  const h = await launchApp({
    "Alpha.md": "Alpha body #work\n",
    "Beta.md": `hello #work\n\n${filler}\n\nthe needle is here\n`,
    "Delta.md": "only #workshop here\n",
    "Work/Gamma.md": "nothing to see\n",
  });
  try {
    const page = h.page;
    const dialog = page.getByRole("dialog", { name: "Search" });
    const field = page.getByRole("textbox", { name: "Search notes" });
    const rows = dialog.locator("[data-search-index]");
    const current = dialog.locator('[data-search-index][aria-selected="true"]');
    const chip = dialog.getByTestId("search-tag-chip");

    // Open three notes; the third is the open one when the palette opens.
    await h.openNote("Alpha");
    await h.openNote("Beta");
    await page.locator('[data-folder-path="Work"]').click();
    await h.openNote("Gamma");
    await expect.poll(() => editorTitle(page)).toBe("Gamma");

    // Recents: newest first, the open note left out, the first highlighted.
    await page.keyboard.press(`${MOD}+p`);
    await expect(field).toBeFocused();
    await expect(dialog.getByText("Recent")).toBeVisible();
    await expect(rows).toHaveText([/^Beta$/, /^Alpha$/]);
    await expect(current).toHaveText(/Beta/);

    // The sidebar behind the scrim stays exactly as it was, whatever is typed.
    const before = await sidebarNoteTitles(page);
    const openBefore = await page
      .locator('[data-folder-path="Work"]')
      .getAttribute("aria-expanded");
    await field.type("zzz");
    await expect(dialog.getByText(/No notes match “zzz”/)).toBeVisible();
    expect(await sidebarNoteTitles(page)).toEqual(before);
    expect(await page.locator('[data-folder-path="Work"]').getAttribute("aria-expanded")).toBe(
      openBefore,
    );
    // Clearing the field brings the recents back.
    await field.fill("");
    await expect(dialog.getByText("Recent")).toBeVisible();
    await expect(rows).toHaveText([/^Beta$/, /^Alpha$/]);

    // Enter on a recent goes back to it.
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(() => editorTitle(page)).toBe("Beta");

    // Enter straight after typing acts on the query as typed.
    await page.keyboard.press(`${MOD}+p`);
    await expect(field).toBeFocused();
    await page.keyboard.type("gam");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(() => editorTitle(page)).toBe("Gamma");

    // A body hit opens the note at the passage.
    await page.keyboard.press(`${MOD}+p`);
    await field.type("needle");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("the needle is here");
    await page.keyboard.press("Enter");
    await expect.poll(() => editorTitle(page)).toBe("Beta");
    await expect(
      page.locator("[data-block-id]", { hasText: "the needle is here" }),
    ).toBeInViewport();

    // `#` lists tags as rows; Enter makes the chip and lists the exact tag's notes.
    await page.keyboard.press(`${MOD}+p`);
    // Beta is open; Gamma (in Work) and Alpha were opened before it.
    await expect(rows).toHaveText([/^GammaWork$/, /^Alpha$/]);
    await field.type("#wo");
    await expect(rows).toHaveText([/#work2/, /#workshop1/]);
    await page.keyboard.press("Enter");
    await expect(chip).toHaveText(/#work/);
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("placeholder", "Search 2 notes");
    await expect(rows).toHaveCount(2);
    await expect(rows).toContainText([/Beta|Alpha/, /Beta|Alpha/]);
    await expect(dialog).not.toContainText("Delta");

    // Text searches within the tagged notes.
    await field.type("hello");
    await expect(rows).toHaveText([/^Beta/]);
    await field.type("zzz");
    await expect(dialog.getByText(/No notes tagged #work match “hellozzz”/)).toBeVisible();

    // Backspace on the empty field puts the tag back as text; the × drops it.
    await field.fill("");
    await page.keyboard.press("Backspace");
    await expect(chip).toBeHidden();
    await expect(field).toHaveValue("#work");
    await expect(rows).toHaveText([/#work2/, /#workshop1/]);
    await page.keyboard.press("Tab");
    await expect(chip).toHaveText(/#work/);
    await dialog.getByRole("button", { name: "Remove #work filter" }).click();
    await expect(chip).toBeHidden();
    await expect(dialog.getByText("Recent")).toBeVisible();

    // Escape closes in one press, chip or not; the next open starts fresh.
    await field.type("#wo");
    await page.keyboard.press("Enter");
    await expect(chip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.keyboard.press(`${MOD}+p`);
    await expect(chip).toBeHidden();
    await expect(field).toHaveValue("");
    await expect(dialog.getByText("Recent")).toBeVisible();
    await page.keyboard.press("Escape");

    // A click on a tag in the note opens the same chip.
    await h.openNote("Alpha");
    await page.locator("[data-block-id] .inline-tag").first().click();
    await expect(chip).toHaveText(/#work/);
    await expect(rows).toHaveCount(2);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("recents are recorded from every route that opens a note and survive a restart", async () => {
  const h = await launchApp({
    "Alpha.md": "alpha\n",
    "Beta.md": "beta\n",
    "Gamma.md": "gamma\n",
    "Delta.md": "delta\n",
  });
  try {
    const dialog = () => h.page.getByRole("dialog", { name: "Search" });
    const rows = () => dialog().locator("[data-search-index]");
    // Sidebar, then the palette itself.
    await h.openNote("Alpha");
    await h.openNote("Beta");
    await h.page.keyboard.press(`${MOD}+p`);
    await h.page.keyboard.type("gam");
    await h.page.keyboard.press("Enter");
    await expect.poll(() => editorTitle(h.page)).toBe("Gamma");
    await h.page.keyboard.press(`${MOD}+p`);
    await expect(rows()).toHaveText([/^Beta$/, /^Alpha$/]);
    await h.page.keyboard.press("Escape");

    await h.restart();
    await h.openNote("Delta");
    await h.page.keyboard.press(`${MOD}+p`);
    await expect(dialog().getByText("Recent")).toBeVisible();
    await expect(rows()).toHaveText([/^Gamma$/, /^Beta$/, /^Alpha$/]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
