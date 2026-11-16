/**
 * A code block's field and a formula's source wrap long lines. ↑ and ↓ leave
 * the field only from its first and last *visual* row: judged by newlines
 * alone, one long wrapped line was both, and ↑ from its last row jumped out
 * of the block (closing the formula's panel) instead of moving up a row.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, START_OF_LINE, launchApp } from "./harness";

const LONG = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

/** Put the focused textarea's caret at `where`, and say how many rows it shows. */
const caretTo = (page: AppHandle["page"], where: "start" | "end") =>
  page.evaluate((w) => {
    const ta = document.activeElement as HTMLTextAreaElement;
    const at = w === "start" ? 0 : ta.value.length;
    ta.setSelectionRange(at, at);
    return Math.round(ta.scrollHeight / Number.parseFloat(getComputedStyle(ta).lineHeight));
  }, where);

const caret = (page: AppHandle["page"]) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLTextAreaElement;
    return el.tagName === "TEXTAREA" ? el.selectionStart : -1;
  });

test("↑ and ↓ move through a wrapped code line, and leave only from its edge rows", async () => {
  h = await launchApp({ "Code.md": `Before.\n\n\`\`\`\n${LONG}\n\`\`\`\n\nAfter.\n` });
  await h.openNote("Code");
  const field = h.page.locator(".code-textarea");
  await field.click();
  await expect(field).toBeFocused();
  expect(await caretTo(h.page, "end")).toBeGreaterThan(2);

  // From the last row, up a row: still in the field, the caret earlier.
  await h.page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  const up = await caret(h.page);
  expect(up).toBeGreaterThan(0);
  expect(up).toBeLessThan(LONG.length);

  // From the first row, down a row.
  await caretTo(h.page, "start");
  await h.page.keyboard.press("ArrowDown");
  await expect(field).toBeFocused();
  expect(await caret(h.page)).toBeGreaterThan(0);

  // The start of the last row is one offset with the end of the row above:
  // Up from there moves up a row, it does not leave.
  await caretTo(h.page, "end");
  await h.page.keyboard.press(START_OF_LINE);
  const rowStart = await caret(h.page);
  expect(rowStart).toBeGreaterThan(0);
  await h.page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  expect(await caret(h.page)).toBeLessThan(rowStart);

  // The edge rows still walk out.
  await caretTo(h.page, "start");
  await h.page.keyboard.press("ArrowUp");
  await expect(field).not.toBeFocused();
  await field.click();
  await caretTo(h.page, "end");
  await h.page.keyboard.press("ArrowDown");
  await expect(field).not.toBeFocused();
  expect(h.pageErrors).toEqual([]);
});

test("↑ from a wrapped formula's last row stays in its source", async () => {
  h = await launchApp({ "Maths.md": `Before.\n\n$$\n${LONG}\n$$\n\nAfter.\n` });
  await h.openNote("Maths");
  const source = h.page.getByRole("textbox", { name: "Formula source" });
  await h.page
    .locator("[data-block-type='math']")
    .getByRole("button", { name: "Edit formula" })
    .click();
  await expect(source).toBeFocused();
  expect(await caretTo(h.page, "end")).toBeGreaterThan(1);
  await h.page.keyboard.press("ArrowUp");
  await expect(source).toBeFocused();
  expect(await caret(h.page)).toBeLessThan(LONG.length);
  // And from the first row it leaves, closing the panel.
  await caretTo(h.page, "start");
  await h.page.keyboard.press("ArrowUp");
  await expect(source).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});
