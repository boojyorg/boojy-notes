import { expect, test } from "@playwright/test";
import { launchApp, SETTLE_MS, sleep, waitForFile } from "./harness";

/**
 * A note's frontmatter shows as its properties: rows you can read, open by
 * default, folded per note and remembered, and the YAML itself behind a value the rows can't show.
 * Showing them changes no byte; the YAML field writes exactly what is typed;
 * YAML the rows can't read opens as YAML.
 */

const NOTE = [
  "---",
  "# Imported from Obsidian",
  'title: "Quoted: with colon"',
  "year: 1980",
  "favourite: true",
  "tags:",
  "  - research",
  "aliases: [Episode V]",
  "source:",
  "  site: imdb",
  "---",
  "Body.",
  "",
].join("\n");

const value = (key: string) => `.props-row[data-key="${key}"] .props-value`;

test("properties open as rows, fold, stay folded after a restart, and showing them writes nothing", async () => {
  const h = await launchApp({ "Film.md": NOTE });
  try {
    await h.openNote("Film");
    await expect(h.page.locator(value("title"))).toHaveText("Quoted: with colon");
    await expect(h.page.locator(value("year"))).toHaveText("1980");
    await expect(h.page.locator(`${value("favourite")} [role=checkbox]`)).toBeChecked();
    await expect(h.page.locator(`${value("tags")} .props-tag`)).toHaveText(/^research/);
    await expect(h.page.locator(value("source"))).toHaveText("site: imdb");

    await h.page.locator(".props-title").click();
    await expect(h.page.locator(".props-row")).toHaveCount(0);

    await h.restart();
    await h.openNote("Film");
    await expect(h.page.locator(".props[data-folded]")).toHaveCount(1);
    await h.page.locator(".props-title").click();
    await expect(h.page.locator(value("title"))).toBeVisible();

    await sleep(SETTLE_MS);
    expect(h.vault.read("Film.md")).toBe(NOTE);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the YAML field writes what is typed, and YAML the rows can't read opens as YAML", async () => {
  const BROKEN = "---\ntags: [a\n---\nBody.\n";
  const h = await launchApp({ "Film.md": NOTE, "Broken.md": BROKEN });
  try {
    await h.openNote("Film");
    await h.page.locator(`${value("source")} button`).click();
    const field = h.page.locator(".props-yaml-field");
    await expect(field).toBeVisible();
    await field.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      const at = el.value.indexOf("\nfavourite");
      el.selectionStart = el.selectionEnd = at;
    });
    await h.page.keyboard.type("\nrating: 4");
    await waitForFile(
      h.vault.file("Film.md"),
      (t) => t === NOTE.replace("year: 1980\n", "year: 1980\nrating: 4\n"),
      { label: "the typed line, and nothing else changed" },
    );
    // Back to the rows, which show what was typed, not what the note held before.
    await h.page.getByRole("button", { name: "Back to properties" }).click();
    await expect(h.page.locator(`.props-row[data-key="rating"] .props-value`)).toHaveText("4");

    await h.openNote("Broken");
    await expect(h.page.locator(".props-yaml-field")).toHaveValue("tags: [a");
    await expect(h.page.locator(".props-note")).toBeVisible();
    await expect(h.page.locator(".props-row")).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Broken.md")).toBe(BROKEN);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
