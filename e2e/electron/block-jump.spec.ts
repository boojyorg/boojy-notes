/**
 * Option+Up/Down (Ctrl off the Mac): block by block to a block's start, its
 * soft breaks counting as one paragraph. Up from inside a block goes to its
 * own start first. A code block is entered at its start, a divider selected,
 * the last block's end and the note's name are the two ends.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

const MOD = process.platform === "darwin" ? "Alt" : "Control";
const FILE =
  "First line\nsoft second line\n\nSecond block.\n\n```js\nlet a = 1;\n```\n\nAfter code.\n\n---\n\nLast block.\n";

let h: AppHandle;
test.beforeEach(async () => {
  h = await launchApp({ "Jump.md": FILE });
  await h.openNote("Jump");
});
test.afterEach(async () => {
  await h?.close();
});

/** Where the caret is: the block's first words and the offset in its text, or the focused field. */
const where = () =>
  h.page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName === "TEXTAREA") {
      return `code@${(active as HTMLTextAreaElement).selectionStart}`;
    }
    if (active?.matches("[data-title]")) return "title";
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const el = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest(
      "[data-block-id]",
    ) as HTMLElement | null;
    if (!el || !sel) return null;
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(sel.anchorNode as Node, sel.anchorOffset);
    return `${(el.textContent ?? "").slice(0, 6)}@${r.toString().length}`;
  });

test("Option+Down walks block starts; Option+Up goes to this block's start, then the one above", async () => {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  // One step past both lines of the first paragraph.
  await expect.poll(where).toBe("Second@0");
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(where).toBe("code@0");
  // Inside the code block its own field keeps the keys: leave it with a click.
  await h.page.getByText("After code.").click();
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  // The divider is selected whole, as the plain arrows do.
  await expect(h.page.locator("[data-block-type='spacer'][data-selected='true']")).toHaveCount(1);

  // The note ends with its empty typing row: Option+Down from the last words
  // lands there, and once more stays at the end.
  await h.page.getByText("Last block.").click();
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(where).toBe("@0");
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(where).toBe("@0");
  // From a block's middle, Option+Up goes to its own start first.
  await h.page.getByText("Last block.").click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(where).toBe("Last b@0");
  await h.page.getByText("Second block.").click();
  await h.page.keyboard.press("Home");
  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(where).toBe("First @0");
  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(where).toBe("title");
  expect(h.pageErrors).toEqual([]);
});

test("Option+Up/Down step through images one at a time, never stuck on a selected one", async () => {
  await h.close();
  h = await launchApp({ "Pics.md": "Before.\n\n![[one.png]]\n\n![[two.png]]\n\nAfter.\n" });
  await h.openNote("Pics");
  const selected = () =>
    h.page
      .locator("[data-block-type='image'][data-selected='true']")
      .evaluateAll((els) => els.map((el) => (el.textContent?.includes("two") ? "two" : "one")));

  await h.page.getByText("Before.").click();
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(selected).toEqual(["one"]);
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(selected).toEqual(["two"]);
  await h.page.keyboard.press(`${MOD}+ArrowDown`);
  await expect.poll(where).toBe("After.@0");
  await expect.poll(selected).toEqual([]);

  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(selected).toEqual(["two"]);
  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(selected).toEqual(["one"]);
  await h.page.keyboard.press(`${MOD}+ArrowUp`);
  await expect.poll(where).toBe("Before@0");
  // The two pictures are missing on purpose: their 404s are the only errors.
  expect(h.pageErrors.filter((m) => !m.includes("404"))).toEqual([]);
});
