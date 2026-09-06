/**
 * A vault holding one indented blockquote line must not hang the app.
 *
 * Reproduces the 2026-09-06 Blocker: `  > quote` (a quote under a list item,
 * ordinary Obsidian output) sent the Markdown parser into an infinite loop.
 * `read-all-notes` runs synchronously in the main process, so a vault with one
 * such file could not be opened at all, and the same file arriving through the
 * watcher froze a running app. Needs the real app: the hang lives in the main
 * process and the watcher, which jsdom never runs.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, noteText, sleep } from "./harness";

const NESTED = "- item\n  > quote under item\n";
const LATER = "   > a three-space quote\n";

test("a vault with an indented quote opens, shows the quote, and keeps its bytes; one arriving later does too", async () => {
  // launchApp itself is the first assertion: it waits for the sidebar, which
  // renders only once read-all-notes has answered.
  const h = await launchApp({ "Nested.md": NESTED, "Plain.md": "Plain body.\n" });
  try {
    await h.openNote("Nested");
    // The list item renders its bullet glyph, so the note is read block by block.
    await expect(h.page.locator('[data-block-type="bullet"]')).toContainText("item");
    const quote = h.page.locator('[data-block-type="blockquote"]');
    await expect(quote).toHaveCount(1);
    await expect(quote).toHaveText("quote under item");

    // Opening is not an edit: the file keeps its exact bytes.
    await sleep(SETTLE_MS);
    expect(h.vault.read("Nested.md")).toBe(NESTED);

    // The watcher path: a file written from outside while the app runs.
    h.vault.write("Later.md", LATER);
    await expect(
      h.page.locator('[role="treeitem"]').filter({ hasText: "Later" }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await h.openNote("Later");
    await expect(h.page.locator('[data-block-type="blockquote"]')).toHaveText(
      "a three-space quote",
    );
    await sleep(SETTLE_MS);
    expect(h.vault.read("Later.md")).toBe(LATER);

    // The app is still answering: another note opens normally.
    await h.openNote("Plain");
    expect(await noteText(h.page)).toBe("Plain body.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
