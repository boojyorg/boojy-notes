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
import { MOD, editorTitle, launchApp, sidebarNoteTitles, waitForFile } from "./harness";

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
    await expect(rows).toHaveText([/^Create “zzz”$/]);
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

test("a parent tag finds its nested tags, and a quoted phrase finds its words together", async () => {
  const h = await launchApp({
    "Lectures.md": "week one #uni/lectures\n",
    "Exams.md": "dates #uni/exams\n",
    "Unity.md": "a game engine #unity\n",
    "Revision.md": "my exam notes for June\n",
    "Plans.md": "write notes for the exam\n",
  });
  try {
    const page = h.page;
    const dialog = page.getByRole("dialog", { name: "Search" });
    const field = page.getByRole("textbox", { name: "Search notes" });
    const rows = dialog.locator("[data-search-index]");

    // `#uni` is listed though no note writes it alone, counting both children.
    await page.keyboard.press(`${MOD}+p`);
    await expect(field).toBeFocused();
    await field.type("#uni");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toHaveText(/^#uni2$/);
    await page.keyboard.press("Enter");
    await expect(field).toHaveAttribute("placeholder", "Search 2 notes");
    await expect(rows).toHaveCount(2);
    await expect(rows).toContainText([/Lectures|Exams/, /Lectures|Exams/]);
    await expect(dialog).not.toContainText("Unity");
    await page.keyboard.press("Escape");

    // Words find both notes; the phrase only the one with them together.
    await page.keyboard.press(`${MOD}+p`);
    await field.type("exam notes");
    await expect(rows).toHaveCount(2);
    await field.fill("");
    await field.type('"exam notes"');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Revision");
    await expect(rows.first()).toContainText("my exam notes for June");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a folder is a result: its chip searches inside it, and Create makes the note there", async () => {
  const h = await launchApp({
    "University/Sem 1/Weekly Progress.md": "progress this week\n",
    "University/Master.md": "weekly progress check-ins\n",
    "Personal/Progress elsewhere.md": "progress\n",
    "Projects/Boojy/Boojy.md": "the suite\n",
  });
  try {
    const page = h.page;
    const dialog = page.getByRole("dialog", { name: "Search" });
    const field = page.getByRole("textbox", { name: "Search notes" });
    const rows = dialog.locator("[data-search-index]");
    const chip = dialog.getByTestId("search-folder-chip");

    // `univ` finds the folder first; Enter makes it the chip.
    await page.keyboard.press(`${MOD}+p`);
    await field.type("univ");
    await expect(rows.first()).toHaveText("University");
    await page.keyboard.press("Enter");
    await expect(chip).toHaveText("University");
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", "Search 2 notes");

    // Typing searches inside it and its subfolders, paths read from inside.
    await field.type("progress");
    await expect(rows).toHaveCount(2);
    await expect(dialog).not.toContainText("Progress elsewhere");
    await expect(rows.first()).toContainText("Sem 1");

    // A note named like a folder stays first.
    await field.fill("");
    await page.keyboard.press("Backspace");
    await expect(chip).toBeHidden();
    await expect(field).toHaveValue("University");
    await field.fill("boojy");
    await expect(rows).toHaveText([/^BoojyProjects \/ Boojy$/, /^BoojyProjects$/]);

    // Nothing matches under the chip: Create makes the note inside the folder.
    await field.fill("univ");
    await expect(rows.first()).toHaveText("University");
    await page.keyboard.press("Enter");
    await field.type("exam plan");
    await expect(rows).toHaveText([/^Create “exam plan”University$/]);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(() => editorTitle(page)).toBe("exam plan");
    await waitForFile(h.vault.file("University/exam plan.md"), () => true, {
      label: "the created note",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a file is found by name and shown in the note's place; a note opens with its matched words tinted", async () => {
  const filler = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of padding.`).join("\n\n");
  const h = await launchApp({
    "University/Report.pdf": "%PDF-1.4\n",
    "attachments/report shot.png": "png",
    "Plan.md": `${filler}\n\nThe interim **progress** report is due Friday.\n`,
  });
  try {
    const page = h.page;
    const dialog = page.getByRole("dialog", { name: "Search" });
    const field = page.getByRole("textbox", { name: "Search notes" });
    const rows = dialog.locator("[data-search-index]");

    // The main process's opener is watched: Enter shows the file in the app, never in Preview.
    await h.app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { opened: string[] };
      g.opened = [];
      shell.openPath = async (p: string) => {
        g.opened.push(p);
        return "";
      };
    });

    // `pdf` finds the file by its extension; the attachment store's never shows.
    await page.keyboard.press(`${MOD}+p`);
    await field.type("pdf");
    await expect(rows).toHaveText([/^Report\.pdfUniversity$/]);
    await field.fill("report");
    await expect(dialog).not.toContainText("report shot");
    await field.fill("pdf");
    await expect(rows).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-file-title]")).toHaveText("Report.pdf");
    expect(
      await h.app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened),
    ).toEqual([]);

    // A body hit opens the note with the matched words tinted, the text untouched.
    await page.keyboard.press(`${MOD}+p`);
    await field.type('"progress report"');
    await expect(rows).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const hl = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get(
            "search-hit",
          );
          return hl ? [...hl].map((r) => r.toString()) : null;
        }),
      )
      .toEqual(["progress report"]);
    await expect(page.locator("[data-block-id] mark")).toHaveCount(0);
    expect(h.vault.read("Plan.md")).toContain("The interim **progress** report is due Friday.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
