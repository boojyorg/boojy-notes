/**
 * One edit, one block root. The editor is a single contentEditable wrapping
 * every block, so Chromium is willing to merge, split or format across two
 * React-owned block roots. Every edit whose reach crosses a block boundary
 * (a selection spanning blocks, forward Delete at the end of a block,
 * Backspace beside a block that owns itself) must be taken over by the app
 * and land in state; Chromium never mutates across roots.
 *
 * Reproduces the 2026-09-07 review's crash (forward Delete then Enter, Cut
 * over two blocks then Enter: React's insertBefore hit a node Chromium had
 * removed), the corruption cases (Shift+Enter, Cmd+B and a URL paste over a
 * selection spanning blocks), a table removed from the screen but not the
 * file, and a code block or divider silently swallowed by a Delete or
 * Backspace beside it. Needs the real app: the failures live between
 * Chromium's editing engine and React's reconciliation.
 */
import { expect, test, type Page } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, editorText, launchApp, sleep, waitForFile } from "./harness";

const START_OF_LINE = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";
const NOTE = "Note.md";
const THREE = "first\n\nsecond\n\nthird\n";

/**
 * Select from the `fromOffset`-th character of block `from` to the
 * `toOffset`-th of block `to` (block indexes in document order), the way a
 * mouse drag across two blocks leaves the selection.
 */
async function selectAcross(
  page: Page,
  from: number,
  fromOffset: number,
  to: number,
  toOffset: number,
) {
  await page.evaluate(
    ([from, fromOffset, to, toOffset]) => {
      const roots = document.querySelectorAll("[data-block-id]");
      const textNode = (root: Element) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) if ((node as Text).data.trim()) return node as Text;
        throw new Error("block has no text");
      };
      const range = document.createRange();
      range.setStart(textNode(roots[from]), fromOffset);
      range.setEnd(textNode(roots[to]), toOffset);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    [from, fromOffset, to, toOffset] as const,
  );
}

const blockTypes = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]")).map((b) =>
      b.getAttribute("data-block-type"),
    ),
  );

test.describe("edits that reach across block roots are owned by the app", () => {
  test("forward Delete at the end of a block merges the next one in; Enter afterwards splits, no crash", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.press("Delete");
      expect(await editorText(h.page)).toBe("firstsecond\nthird\n");
      await h.page.keyboard.type("-");
      await h.page.keyboard.press("Enter");
      await h.page.keyboard.type("!");
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("!second"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("first-\n\n!second\n\nthird\n");
      expect(await editorText(h.page)).toBe("first-\n!second\nthird\n");
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("Cut over a selection spanning two blocks leaves one block; Enter afterwards splits, no crash", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await selectAcross(h.page, 0, 2, 1, 3);
      await h.page.keyboard.press(`${MOD}+x`);
      expect(await editorText(h.page)).toBe("fiond\nthird\n");
      await h.page.keyboard.press("Enter");
      await h.page.keyboard.type("!");
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("!ond"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("fi\n\n!ond\n\nthird\n");
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("Shift+Enter over a selection spanning two blocks leaves a soft break in one block", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await selectAcross(h.page, 0, 2, 1, 3);
      await h.page.keyboard.press("Shift+Enter");
      await h.page.keyboard.type("!");
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("!ond"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("fi\n!ond\n\nthird\n");
      expect(await editorText(h.page)).toBe("fi\n!ond\nthird\n");
      expect(await blockTypes(h.page)).toEqual(["p", "p", "p"]);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("typing over a selection spanning two blocks replaces it inside one block", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await selectAcross(h.page, 0, 2, 1, 3);
      await h.page.keyboard.type("Z");
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("fiZond"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("fiZond\n\nthird\n");
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("Cmd+B over a selection spanning two blocks bolds both, and both reach the file", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await selectAcross(h.page, 0, 2, 1, 3);
      await h.page.keyboard.press(`${MOD}+b`);
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("**"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("fi**rst**\n\n**sec**ond\n\nthird\n");
      expect(await editorText(h.page)).toBe("first\nsecond\nthird\n");
      expect(await blockTypes(h.page)).toEqual(["p", "p", "p", "p"]);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("a URL pasted over a selection spanning two blocks replaces the selection with the URL", async () => {
    const h = await launchApp({ [NOTE]: THREE });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await selectAcross(h.page, 0, 2, 1, 3);
      await h.page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData("text/plain", "https://example.com");
        document
          .querySelector("[data-editor]")!
          .dispatchEvent(
            new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
          );
      });
      await waitForFile(h.vault.file(NOTE), (t) => t.includes("example.com"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("fihttps://example.comond\n\nthird\n");
      expect(await blockTypes(h.page)).toEqual(["p", "p", "p"]);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("a selection from a paragraph into a table cell, then Backspace, changes nothing", async () => {
    const md = "first\n\n| a | b |\n| --- | --- |\n| c | d |\n";
    const h = await launchApp({ [NOTE]: md });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await h.page.evaluate(() => {
        const first = document.querySelector("[data-block-id]")!.firstChild as Text;
        const cell = document.querySelector(
          "[data-block-type='table'] td, [data-block-type='table'] th",
        )!;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const cellText = walker.nextNode() as Text;
        const range = document.createRange();
        range.setStart(first, 2);
        range.setEnd(cellText, 1);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
      });
      await h.page.keyboard.press("Backspace");
      await sleep(SETTLE_MS);
      expect(await h.page.locator("[data-block-type='table']").count()).toBe(1);
      expect(await editorText(h.page)).toContain("first");
      expect(h.vault.read(NOTE)).toBe(md);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("forward Delete at the end of the block above a divider selects the divider; a second Delete removes it", async () => {
    const h = await launchApp({ [NOTE]: "Alpha.\n\n---\nBeta.\n" });
    try {
      await h.openNote("Note");
      await h.page.locator("[data-block-id]").first().click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.press("Delete");
      await expect(h.page.locator('[data-block-type="spacer"][data-selected="true"]')).toHaveCount(
        1,
      );
      expect(await editorText(h.page)).toBe("Alpha.\n\nBeta.\n");
      await h.page.keyboard.press("Delete");
      await expect(h.page.locator('[data-block-type="spacer"]')).toHaveCount(0);
      await waitForFile(h.vault.file(NOTE), (t) => !t.includes("---"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(NOTE)).toBe("Alpha.\n\nBeta.\n");
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  test("Backspace under, and forward Delete above, a code block leave the code block alone", async () => {
    // Tight forms: nothing but the code block beside the caret. (With an
    // empty row between, Delete merges that row away, as it should.)
    const md = "```js\ncode\n```\nbelow\n";
    const other = "above\n```js\ncode\n```\n";
    const h = await launchApp({ [NOTE]: md, "Other.md": other });
    try {
      await h.openNote("Note");
      await h.page.locator('[data-block-type="p"]').first().click();
      await h.page.keyboard.press(START_OF_LINE);
      await h.page.keyboard.press("Backspace");
      await sleep(SETTLE_MS);
      expect(await h.page.locator('[data-block-type="code"]').count()).toBe(1);
      expect(await editorText(h.page)).toContain("below");
      expect(h.vault.read(NOTE)).toBe(md);

      await h.openNote("Other");
      await h.page.locator('[data-block-type="p"]').first().click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.press("Delete");
      await sleep(SETTLE_MS);
      expect(await h.page.locator('[data-block-type="code"]').count()).toBe(1);
      expect(await editorText(h.page)).toContain("above");
      expect(h.vault.read("Other.md")).toBe(other);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });
});
