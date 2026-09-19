/**
 * The divider is a block you can address as a whole. Typing `--- ` under a
 * paragraph writes the blank line CommonMark needs before it (without one,
 * `---` under a line of text is a heading underline everywhere but here);
 * Backspace at the start of the block below selects the rule instead of
 * merging text across it, and a second Backspace removes it; the arrow keys
 * stop on it on the way past; a click selects it, Enter opens a paragraph
 * under it, Delete removes it, undo brings it back; and a conventional file
 * with a blank line either side of its rule opens with no stray empty row
 * above it. Everything is checked against the bytes on disk.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const START_OF_LINE = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";

const RULE = '[data-block-type="spacer"]';
const SELECTED_RULE = '[data-block-type="spacer"][data-selected="true"]';

/** Every block root's type, in document order. */
const blockTypes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]")).map((b) =>
      b.getAttribute("data-block-type"),
    ),
  );

test("typing --- under a paragraph writes a blank line before it; Backspace from below selects, then removes it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("--- ");
    await expect(h.page.locator(RULE)).toHaveCount(1);
    // The caret lands in a fresh paragraph under the rule.
    await h.page.keyboard.type("world");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("world"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nworld\n");

    // Backspace at the start of the block below: the rule is selected, nothing merges.
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("Backspace");
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(1);
    expect(await blockTypes(h.page)).toEqual(["p", "spacer", "p", "p"]);

    // A second Backspace removes it and the caret is back at the start of "world".
    await h.page.keyboard.press("Backspace");
    await expect(h.page.locator(RULE)).toHaveCount(0);
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Xworld"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nXworld\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a conventional file opens with no stray row; arrows stop on the rule; click, Enter, Delete and undo address it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n\n---\n\nOmega.\n" });
  try {
    await h.openNote("Alpha");
    // The blank before the rule is structure; the one after it is a visible row.
    expect(await blockTypes(h.page)).toEqual(["p", "spacer", "p", "p", "p"]);

    // ArrowDown from the paragraph above lands on the rule, selected; again moves on.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("ArrowDown");
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(1);
    await h.page.keyboard.press("ArrowDown");
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(0);
    await h.page.keyboard.type("mid");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("mid"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nmid\n\nOmega.\n");

    // Click selects; Enter opens a paragraph under the rule with the caret in it.
    await h.page.locator(RULE).click();
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(1);
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(0);
    await h.page.keyboard.type("new");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("new"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nnew\n\nmid\n\nOmega.\n");

    // Delete removes a clicked rule; undo brings it back.
    await h.page.locator(RULE).click();
    await expect(h.page.locator(SELECTED_RULE)).toHaveCount(1);
    await h.page.keyboard.press("Delete");
    await expect(h.page.locator(RULE)).toHaveCount(0);
    await waitForFile(h.vault.file("Alpha.md"), (t) => !t.includes("---"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\nnew\n\nmid\n\nOmega.\n");
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(h.page.locator(RULE)).toHaveCount(1);
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("---"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nnew\n\nmid\n\nOmega.\n");

    // It all survives a restart, still with no row invented above the rule.
    await h.restart();
    await h.openNote("Alpha");
    expect(await blockTypes(h.page)).toEqual(["p", "spacer", "p", "p", "p", "p"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// Every marker waits for its space (2026-09-19), the divider included: until
// it arrives the dashes are text, and Enter opens the rule the same way, since
// a paragraph of dashes left on disk is a rule to every Markdown reader
// anyway. CommonMark's break is three dashes or more, so a longer run is the
// same rule rather than something else.
test("the dashes wait for a space, Enter opens the rule too, and a long run is the same rule", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");

    // Three dashes alone are still text, and a run of ten can be typed at all.
    await h.page.keyboard.type("----------");
    await expect(h.page.locator(RULE)).toHaveCount(0);
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).toContain("----------");

    // The space opens the rule, however long the run.
    await h.page.keyboard.type(" ");
    await expect(h.page.locator(RULE)).toHaveCount(1);
    await h.page.keyboard.type("under");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("under"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nunder\n");

    // And Enter on a bare run opens one as well.
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("---");
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator(RULE)).toHaveCount(2);
    await waitForFile(h.vault.file("Alpha.md"), (t) => (t.match(/^---$/gm) ?? []).length === 2);
    await sleep(SETTLE_MS);
    // The empty paragraph the second rule opened under it is a row of its own.
    expect(h.vault.read("Alpha.md")).toBe("Alpha.\n\n---\nunder\n\n---\n\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
