/**
 * Shift+ArrowUp/Down extend a selection across block edges (review §1.13).
 *
 * The editor moves a caret between blocks itself on ArrowUp and ArrowDown
 * (`useKeyboardHandlers`), and until 2026-09-24 it did so for a Shift press
 * too: Shift+Down on a block's last line put a collapsed caret in the next
 * block instead of selecting down into it. Needs the real app: which line the
 * caret is on is a question of layout.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, START_OF_LINE, launchApp } from "./harness";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ "S.md": "First line here\n\nSecond line here\n\nThird\n" });
  await h.openNote("S");
});

test.afterEach(async () => {
  await h?.close();
});

const para = (text: string) => h.page.locator('[data-block-type="p"]', { hasText: text });
/** The selection, and the text of the block each of its ends is in. */
const selection = () =>
  h.page.evaluate(() => {
    const s = window.getSelection();
    const blockOf = (n: Node | null | undefined) => {
      const el = n?.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element | null);
      return el?.closest("[data-block-type]")?.textContent ?? null;
    };
    return {
      collapsed: s?.isCollapsed ?? true,
      from: blockOf(s?.anchorNode),
      to: blockOf(s?.focusNode),
    };
  });

test("Shift+Down from a block's last line selects into the next block", async () => {
  await para("First").click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.press("Shift+ArrowDown");
  // From the start of one line to the start of the next: the whole first
  // block, ending in the second.
  expect(await selection()).toEqual({
    collapsed: false,
    from: "First line here",
    to: "Second line here",
  });
});

test("Shift+Up from a block's first line selects into the block above", async () => {
  await para("Second").click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.press("Shift+ArrowUp");
  expect(await selection()).toEqual({
    collapsed: false,
    from: "Second line here",
    to: "First line here",
  });
});

test("a plain ArrowDown still moves the caret into the next block", async () => {
  await para("First").click();
  await h.page.keyboard.press("ArrowDown");
  expect(await selection()).toEqual({
    collapsed: true,
    from: "Second line here",
    to: "Second line here",
  });
});
