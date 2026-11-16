/**
 * Names and the links that reach them (calls of 2026-11-09 and 2026-11-16).
 *
 * - A bare `[[Name]]` several notes share means the one nearest the vault's
 *   root, so a root note beside a namesake in a folder can be linked at all;
 *   two at the same depth is still a tie, drawn dashed.
 * - A name the app makes never holds `#`, `^`, `[` or `]`, which a link's own
 *   syntax is made of: they are written `_`, as `|` already was. A name the
 *   disk holds is kept.
 * - A note whose kept name holds one of those is linked by a Markdown link,
 *   the name encoded, from both ways into the picker.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  START_OF_LINE,
  editorTitle,
  expandAllFolders,
  launchApp,
  mdFiles,
  renameRow,
  sleep,
  waitForFile,
} from "./harness";

const picker = (page: Page) => page.getByTestId("link-picker");
const option = (page: Page, text: RegExp) =>
  picker(page).locator('[role="option"]').filter({ hasText: text });
const rowsOf = (page: Page) =>
  picker(page)
    .locator('[role="option"]')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
    );

/** Select the last word of the first block. */
async function selectLastWord(page: Page, word: string) {
  await page
    .locator("[data-block-id]")
    .first()
    .click({ position: { x: 4, y: 8 } });
  await page.keyboard.press(END_OF_LINE);
  for (let i = 0; i < word.length; i++) await page.keyboard.press("Shift+ArrowLeft");
}

test("a bare name means the note nearest the root: it is linked, drawn and opened", async () => {
  const h = await launchApp({
    "Alpha.md": "see here\n\n[[Gamma]] and [[Work/Gamma]] and [[Plan]]\n",
    "Gamma.md": "root gamma\n",
    "Work/Gamma.md": "work gamma\n",
    "Work/Plan.md": "work plan\n",
    "Home/Plan.md": "home plan\n",
  });
  try {
    const page = h.page;
    await expandAllFolders(page);
    await h.openNote("Alpha");
    // As written in the file: the root's and the path's are links, the tie is not.
    const drawn = page.locator("[data-block-id]").nth(1).locator(".wikilink");
    await expect(drawn).toHaveCount(3);
    expect(await drawn.evaluateAll((els) => els.map((el) => el.className))).toEqual([
      "wikilink",
      "wikilink",
      "wikilink wikilink-broken",
    ]);

    // The picker writes the root note's bare name, and it is a link.
    await selectLastWord(page, "here");
    await page.keyboard.press(`${MOD}+k`);
    await expect(picker(page)).toBeVisible();
    await page.keyboard.type("Gamma");
    // The root note's row names the storage location, the other its folder.
    expect(await rowsOf(page)).toEqual(["Gamma Notes", "Gamma Work"]);
    await option(page, /Notes/).click();
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("[[Gamma|here]]"));
    const made = page.locator("[data-block-id]").first().locator(".wikilink");
    await expect(made).toHaveClass("wikilink");

    await made.click();
    await expect.poll(() => editorTitle(page)).toBe("Gamma");
    await expect(page.locator("[data-block-id]").first()).toHaveText("root gamma");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a new name's #, ^, [ and ] are written _, and a name the disk holds is kept", async () => {
  const h = await launchApp({ "Old.md": "old\n", "Why #1.md": "why\n", "Alpha.md": "see here\n" });
  try {
    const page = h.page;
    await renameRow(page, "Old", "C# [x] ^2");
    await expect
      .poll(() => mdFiles(h.vault).sort())
      .toEqual(["Alpha.md", "C_ _x_ _2.md", "Why #1.md"]);

    // Editing the kept note's text leaves its name alone.
    await h.openNote("Why #1");
    await page.locator("[data-block-id]").first().click();
    await page.keyboard.press(END_OF_LINE);
    await page.keyboard.type("!");
    await waitForFile(h.vault.file("Why #1.md"), (t) => t === "why!\n");
    expect(mdFiles(h.vault).sort()).toEqual(["Alpha.md", "C_ _x_ _2.md", "Why #1.md"]);

    // No Create for a name that would be made under another.
    await h.openNote("Alpha");
    await selectLastWord(page, "here");
    await page.keyboard.press(`${MOD}+k`);
    await page.keyboard.type("New#Thing");
    expect(await rowsOf(page)).toEqual([]);
    await page.keyboard.press("Escape");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a kept name a wikilink cannot hold is linked by a Markdown link that opens it", async () => {
  const h = await launchApp({
    "Alpha.md": "see here\n\nand\n",
    "C# notes.md": "c sharp\n",
    "Work/Notes [2024].md": "notes\n",
  });
  try {
    const page = h.page;
    await expandAllFolders(page);
    await h.openNote("Alpha");

    // Cmd+K over a selection.
    await selectLastWord(page, "here");
    await page.keyboard.press(`${MOD}+k`);
    await page.keyboard.type("C#");
    await option(page, /C# notes/).click();
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("[here](C%23%20notes.md)"));

    // `[[` at the caret.
    await page.locator("[data-block-id]").nth(1).click();
    await page.keyboard.press(END_OF_LINE);
    await page.keyboard.type(" [[Notes");
    await option(page, /Notes \[2024\]/).click();
    const written = await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("2024"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe(
      "see [here](C%23%20notes.md)\n\nand [Notes \\[2024\\]](Work/Notes%20%5B2024%5D.md)\n",
    );
    expect(written).toContain("Work/Notes%20%5B2024%5D.md");

    // Both open their notes.
    await page.locator("[data-block-id]").nth(1).locator("a, .wikilink").first().click();
    await expect.poll(() => editorTitle(page)).toBe("Notes [2024]");
    await h.openNote("Alpha");
    await page.keyboard.press(START_OF_LINE);
    await page.locator("[data-block-id]").first().locator("a, .wikilink").first().click();
    await expect.poll(() => editorTitle(page)).toBe("C# notes");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
