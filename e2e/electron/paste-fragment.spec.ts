/**
 * Pasted text is a piece of a note, never a whole file.
 *
 * - `---` … `---` at the head of a paste was read as frontmatter wherever the
 *   caret stood, so a Properties block landed mid-note; the file then held
 *   `---` lines that the next open read as a divider and text. Mid-note they
 *   are pasted as exactly that. Only the empty first block of a note takes a
 *   pasted Properties block: a whole note pasted into a new one.
 * - The caret after a block paste is counted in what is drawn, not in the
 *   Markdown's length, so it lands at the end of the paste when the pasted
 *   line has formatting and text follows it.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, SETTLE_MS, blockTypes, launchApp, sleep, waitForFile } from "./harness";

const WHOLE_NOTE = "---\ntitle: Pasted\n---\nBody";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ "Paste.md": "Start\n\nab\n", "Blank.md": "" });
});

test.afterEach(async () => {
  await h?.close();
});

/** Paste plain text at the caret, as another app's copy would arrive. */
const paste = (plain: string) =>
  h.page.evaluate((p) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", p);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(ev);
  }, plain);

test("a note's text pasted mid-note brings no Properties block", async () => {
  await h.openNote("Paste");
  await h.page.locator('[data-block-type="p"]', { hasText: "Start" }).click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press("Enter");
  await paste(WHOLE_NOTE);
  await waitForFile(h.vault.file("Paste.md"), (t) => t.includes("Body"));
  await sleep(SETTLE_MS);
  expect(await blockTypes(h.page)).not.toContain("frontmatter");
  const written = h.vault.read("Paste.md");
  expect(written.startsWith("Start\n")).toBe(true);
  expect(written).toContain("title: Pasted");

  // What was written is what the next open reads: nothing changes shape.
  const before = await blockTypes(h.page);
  await h.openNote("Blank");
  await h.openNote("Paste");
  expect(await blockTypes(h.page)).toEqual(before);
  await sleep(SETTLE_MS);
  expect(h.vault.read("Paste.md")).toBe(written);
  expect(h.pageErrors).toEqual([]);
});

test("pasted into a new, empty note, its properties are the note's", async () => {
  await h.openNote("Blank");
  await h.page.locator("[data-block-id]").first().click();
  await paste(WHOLE_NOTE);
  const written = await waitForFile(h.vault.file("Blank.md"), (t) => t.includes("Body"));
  expect((await blockTypes(h.page))[0]).toBe("frontmatter");
  // The empty file ended with no newline, and its ending is kept.
  expect(written).toBe("---\ntitle: Pasted\n---\n\nBody");
  expect(h.pageErrors).toEqual([]);
});

test("the caret lands at the end of a formatted paste, before the text that followed", async () => {
  await h.openNote("Paste");
  await h.page.locator('[data-block-type="p"]', { hasText: "ab" }).click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press("ArrowLeft");
  await paste("one\n**two** [three](https://example.com)");
  await h.page.keyboard.type("X");
  await waitForFile(h.vault.file("Paste.md"), (t) => t.includes("X"));
  await sleep(SETTLE_MS);
  expect(h.vault.read("Paste.md")).toBe(
    // Two plain lines are one paragraph with a soft break, as any paste.
    "Start\n\naone\n**two** [three](https://example.com)Xb\n",
  );
  expect(h.pageErrors).toEqual([]);
});
