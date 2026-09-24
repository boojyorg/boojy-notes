/**
 * ArrowUp from a note's first line reaches its name, and ArrowDown from the
 * name comes back (2026-09-24). The key was dead since the name moved into the
 * chrome row's path band: the old lookup searched above the editor for an h1.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const focusedIsTitle = (page) =>
  page.evaluate(() => document.activeElement?.hasAttribute("data-title") ?? false);

test("ArrowUp from the first line goes to the name; ArrowDown comes back", async () => {
  const h = await launchApp({ "Alpha.md": "First line\n\nSecond line\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]", { hasText: "First line" }).click();
    await h.page.keyboard.press("ArrowUp");
    expect(await focusedIsTitle(h.page)).toBe(true);
    // The caret rests at the name's end: typing extends it.
    await h.page.keyboard.type("s");
    await h.page.keyboard.press("ArrowDown");
    expect(await focusedIsTitle(h.page)).toBe(false);
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Alphas.md"), (t) => t.startsWith("XFirst line"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alphas.md")).toBe("XFirst line\n\nSecond line\n");
  } finally {
    await h.close();
  }
});

test("a note that opens with frontmatter: ArrowUp from its first text line reaches the name", async () => {
  const h = await launchApp({ "Alpha.md": "---\ntags: [a]\n---\nBody\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]", { hasText: "Body" }).click();
    await h.page.keyboard.press("ArrowUp");
    expect(await focusedIsTitle(h.page)).toBe(true);
  } finally {
    await h.close();
  }
});
