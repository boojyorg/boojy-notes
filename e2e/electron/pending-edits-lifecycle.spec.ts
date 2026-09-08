/**
 * Text typed into a note must reach that note's file or be discarded by an
 * explicit action of the user's; a change of the note's lifecycle (a draft
 * becoming a file, the app quitting) in the window between the keystroke and
 * the write must never lose it.
 *
 * Reproduces the review finding (2026-09-07, §2.6): the launch draft became a
 * note only once the text commit had reached React state, 300 ms after the
 * keystroke, while switching notes discarded a draft on sight and the quit
 * flush skipped drafts outright. Typing into the draft and clicking another
 * note, or quitting, inside that window deleted the text with no undo. One
 * character is typed because a second keystroke publishes the first at once
 * (commitTextChange flushes a pending commit before taking the next), so only
 * the last keystroke of a burst is ever inside the window. Needs the real app:
 * the commit debounce, the draft effects and the quit handshake are the whole
 * story.
 */
import { expect, test } from "@playwright/test";
import { expectNoTempFiles, launchApp, sleep, SETTLE_MS, waitForFile } from "./harness";

const mdFiles = (h: Awaited<ReturnType<typeof launchApp>>) =>
  h.vault.list().filter((f) => f.endsWith(".md"));

/** Click another note's row at once, without the actionability wait a click takes. */
const switchTo = (h: Awaited<ReturnType<typeof launchApp>>, title: string) =>
  h.page.locator('[role="treeitem"]').filter({ hasText: title }).first().dispatchEvent("click");

test("a name typed into the launch draft survives switching to another note at once", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    // A fresh profile opens on a draft, not on Alpha. The name is the one
    // field whose text reaches the note through the text commit alone.
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toHaveText("");
    await title.click();
    await h.page.keyboard.type("K");
    await switchTo(h, "Alpha");

    await waitForFile(h.vault.file("K.md"), (t) => t === "", {
      label: "the draft's file under the name typed",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Alpha.md", "K.md"]);
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "K" })).toHaveCount(1);
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a name typed into the launch draft survives quitting at once", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toHaveText("");
    await title.click();
    await h.page.keyboard.type("K");
    const typed = Date.now();
    await h.quit();
    // The quit handshake must reach the renderer's flush inside the 300 ms
    // text-commit window, or this proves nothing; the harness does it in ~100 ms.
    expect(Date.now() - typed, "quit took too long to be inside the commit window").toBeLessThan(
      300,
    );

    expect(mdFiles(h)).toEqual(["Alpha.md", "K.md"]);
    expect(h.vault.read("K.md")).toBe("");
    expectNoTempFiles(h.vault);
  } finally {
    await h.close();
  }
});

test("body text typed into the launch draft survives switching to another note at once", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText("");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.type("K");
    await switchTo(h, "Alpha");

    await waitForFile(h.vault.file("Untitled.md"), (t) => t === "K", {
      label: "the draft's text under the Untitled fallback",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Alpha.md", "Untitled.md"]);
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Untitled" })).toHaveCount(
      1,
    );
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a draft that never held text is not written by a switch or a quit", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText("");
    await h.page.locator("[data-block-id]").first().click();
    await h.openNote("Alpha");
    await sleep(SETTLE_MS);
    expect(mdFiles(h)).toEqual(["Alpha.md"]);
    await h.quit();
    expect(mdFiles(h)).toEqual(["Alpha.md"]);
  } finally {
    await h.close();
  }
});
