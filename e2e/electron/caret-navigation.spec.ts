/**
 * The arrows around a block that keeps a field of its own — a code block, a
 * callout, a table — and the scroll they must not cause (2026-09-19).
 *
 * Three things were wrong in daily use. Leaving such a block put the caret in
 * the right place and **scrolled the note to the top**, because taking focus
 * back to the editor root scrolls that root into view and it spans the whole
 * note. The arrows **stepped over a code block** in both directions, so the
 * pointer was the only way in. And a key pressed inside the block reached the
 * editor root, which acted on the document selection — stale or empty while a
 * textarea has focus — and moved the caret out of the block, or typed the
 * character into the note's first block.
 *
 * Needs the real app: every one of these is a question about layout, focus and
 * the scroll container.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, END_OF_LINE, SETTLE_MS, launchApp, sleep } from "./harness";

const NOTE = "Long.md";
// Long enough that the note scrolls with the code block below the fold.
const FILLER = Array.from({ length: 14 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
const FILE = `${FILLER}\n\n\`\`\`js\nlet a = 1;\nlet b = 2;\n\`\`\`\n\nAfter the code.\n\n---\n\nLast.\n`;

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: FILE });
  await h.openNote("Long");
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(900, 480);
  });
  await expect
    .poll(async () => await h.page.evaluate(() => window.innerHeight), { timeout: 5_000 })
    .toBeLessThanOrEqual(480);
});

test.afterEach(async () => {
  await h?.close();
});

const scrollTop = () =>
  h.page.evaluate(() => document.querySelector(".editor-scroll")?.scrollTop ?? -1);

/** The block the caret is in, by type and by its first few characters. */
const caretBlock = () =>
  h.page.evaluate(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode as Node | null;
    const el = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest(
      "[data-block-id]",
    ) as HTMLElement | null;
    return el ? `${el.dataset.blockType}:${(el.textContent ?? "").slice(0, 14)}` : null;
  });

/** Scroll the code block into the middle of the view and put the caret in it. */
async function caretInCode(at: "start" | "end") {
  await h.page.locator("textarea.code-textarea").evaluate((ta, edge) => {
    ta.scrollIntoView({ block: "center" });
    (ta as HTMLTextAreaElement).focus();
    const pos = edge === "end" ? (ta as HTMLTextAreaElement).value.length : 0;
    (ta as HTMLTextAreaElement).selectionStart = pos;
    (ta as HTMLTextAreaElement).selectionEnd = pos;
  }, at);
}

test("leaving a code block by the arrows keeps the note where it was", async () => {
  await caretInCode("end");
  const before = await scrollTop();
  expect(before).toBeGreaterThan(40);

  // Out of the block: the blank line the file keeps around a fence is a row of
  // its own, so that is where the caret lands.
  await h.page.keyboard.press("ArrowDown");
  await expect(h.page.locator("textarea.code-textarea")).not.toBeFocused();
  expect(await caretBlock()).toBe("p:");
  // The caret moved; the note did not.
  expect(Math.abs((await scrollTop()) - before)).toBeLessThan(40);

  // And back up into the block's own field, still without moving the note.
  await h.page.keyboard.press("ArrowUp");
  await expect(h.page.locator("textarea.code-textarea")).toBeFocused();
  expect(Math.abs((await scrollTop()) - before)).toBeLessThan(40);
  expect(h.pageErrors).toEqual([]);
});

test("the arrows walk into the code block instead of over it", async () => {
  const ta = h.page.locator("textarea.code-textarea");
  // From the text above, down through the blank row, into the code's first line.
  await h.page.locator("[data-block-type='p']", { hasText: "Line 14." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("ArrowDown");
  expect(await caretBlock()).toBe("p:");
  await h.page.keyboard.press("ArrowDown");
  await expect(ta).toBeFocused();
  expect(await ta.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBe(0);

  // Down through its own two lines and out the other side.
  await h.page.keyboard.press("ArrowDown");
  await expect(ta).toBeFocused();
  await h.page.keyboard.press("ArrowDown");
  expect(await caretBlock()).toBe("p:");
  await h.page.keyboard.press("ArrowDown");
  expect(await caretBlock()).toBe("p:After the code");

  // And back up: the block is entered at its end, never stepped over.
  await h.page.keyboard.press("ArrowUp");
  await h.page.keyboard.press("ArrowUp");
  await expect(ta).toBeFocused();
  const value = await ta.inputValue();
  expect(await ta.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBe(value.length);
  expect(h.pageErrors).toEqual([]);
});

// The editor root is only what a key pressed in the field bubbles through. It
// used to act on the document selection, which is left in another block while
// a textarea has focus: an arrow inside the code took focus out of it, and a
// letter landed in the note's first block with the page scrolled to the top
// (both seen by hand in a running app on 2026-09-19). This is the invariant,
// not a reproduction: the harness does not leave the selection in the state
// the pointer does, so it passed before the guard as well as after it.
test("a key pressed inside the code block stays inside it", async () => {
  const ta = h.page.locator("textarea.code-textarea");
  await caretInCode("start");
  const before = await scrollTop();
  // Exactly the state a click into a code block leaves: the caret is in the
  // field, the document's own selection is still up in another block.
  await h.page.evaluate(() => {
    const above = [...document.querySelectorAll("[data-block-id]")].find((b) =>
      (b.textContent ?? "").startsWith("Line 14."),
    ) as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(above);
    // At that block's end, where the arrow branch it is not meant to run
    // reads the caret as being on its last line.
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  await ta.evaluate((el) => {
    (el as HTMLTextAreaElement).focus();
    (el as HTMLTextAreaElement).selectionStart = 3;
    (el as HTMLTextAreaElement).selectionEnd = 3;
  });

  // An arrow the block does not claim (it is not at an edge) is the field's.
  await h.page.keyboard.press("ArrowDown");
  await expect(ta).toBeFocused();
  expect(await ta.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)).toBeGreaterThan(10);
  expect(Math.abs((await scrollTop()) - before)).toBeLessThan(40);

  // And so is a letter, whatever the document selection says.
  await h.page.keyboard.type("x");
  await expect(ta).toBeFocused();
  expect(await ta.inputValue()).toContain("x");
  expect(await h.page.locator("[data-block-id]").first().innerText()).toBe("Line 1.");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toContain("Line 1.");
  expect(h.pageErrors).toEqual([]);
});

// A caret in an empty paragraph has no rect of its own, and the arrows ask the
// block's edges about it, so ArrowDown never ran its branch there: the divider
// under the empty row could not be reached by the keyboard at all.
test("ArrowDown from an empty paragraph still reaches the block under it", async () => {
  await h.page.locator("[data-block-type='p']", { hasText: "After the code." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  // Enter opens an empty row above the rule; the blank line a file keeps
  // before a divider is structure, not a row, so this is how you get one.
  await h.page.keyboard.press("Enter");
  expect(await caretBlock()).toBe("p:");
  await h.page.keyboard.press("ArrowDown");
  await expect(h.page.locator("[data-block-type='spacer'][data-selected='true']")).toHaveCount(1);
  expect(h.pageErrors).toEqual([]);
});
