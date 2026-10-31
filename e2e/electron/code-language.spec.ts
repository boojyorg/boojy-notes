/**
 * A code block's language is chosen from the app's own menu, opened by the
 * language button in the block's hover toolbar or by the block's ··· (2026-09-19,
 * replacing a bespoke dropdown and a second copy of the list in a hover
 * submenu). It is the Sort menu's grammar: radio rows, a check on the chosen
 * one, arrows and Enter and Escape, and a letter jumps to a language.
 *
 * Needs the real app: the menu portals to `body` out of the editor's
 * contentEditable, and its keys have to be claimed before the editor's own —
 * a portal leaves the DOM but not the React tree, so Enter reached the editor
 * first and opened a new block instead of choosing.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Code.md";
const FILE = "Intro.\n\n```\nconst a = 1;\n```\n";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: FILE });
  await h.openNote("Code");
});

test.afterEach(async () => {
  await h?.close();
});

const label = (page: AppHandle["page"]) => page.getByRole("button", { name: "Code language" });
const menu = (page: AppHandle["page"]) => page.getByRole("menu", { name: "Code language" });

test("the label opens the menu, Plain text first then alphabetical, with the block's own language checked", async () => {
  await expect(label(h.page)).toHaveText(/Plain text/);
  await h.page.locator(".code-block").first().hover();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  // Focus lands a frame after the menu shows; a key before that misses it.
  await expect(menu(h.page)).toBeFocused();
  expect(await menu(h.page).getByRole("menuitemradio").allInnerTexts()).toEqual([
    "Plain text",
    "Bash",
    "C#",
    "C++",
    "CSS",
    "HTML",
    "Java",
    "JavaScript",
    "JSON",
    "LaTeX",
    "Markdown",
    "Mermaid",
    "Python",
    "R",
    "SQL",
    "TypeScript",
  ]);
  const checked = menu(h.page).locator('[role="menuitemradio"][aria-checked="true"]');
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveText("Plain text");
  expect(h.pageErrors).toEqual([]);
});

test("a letter jumps to a language and Enter writes its fence word to disk", async () => {
  const blocksBefore = await h.page.locator("[data-block-type]").count();
  await h.page.locator(".code-block").first().hover();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  // Focus lands a frame after the menu shows; a key before that misses it.
  await expect(menu(h.page)).toBeFocused();
  // The menu holds focus, so the letter never reaches the code field under it.
  await h.page.keyboard.press("t");
  await expect(menu(h.page)).toHaveAttribute("aria-activedescendant", "code-lang-item-15");
  await h.page.keyboard.press("Enter");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/TypeScript/);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("```typescript"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n```typescript\nconst a = 1;\n```\n");
  // The Enter that chose it never reached the editor, which would have opened
  // a block of its own: the note holds exactly the blocks it did.
  expect(await h.page.locator("[data-block-type]").count()).toBe(blocksBefore);
  expect(h.pageErrors).toEqual([]);
});

test("Escape closes it and changes nothing", async () => {
  await h.page.locator(".code-block").first().hover();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  // Focus lands a frame after the menu shows; a key before that misses it.
  await expect(menu(h.page)).toBeFocused();
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("Escape");
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/Plain text/);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(FILE);
  expect(h.pageErrors).toEqual([]);
});

test("the block's ··· menu opens the same menu, and carries no list of its own", async () => {
  await h.page.locator(".code-block").click({ button: "right" });
  const items = h.page.locator(".code-ctx-menu [role=menuitem]");
  expect(await items.allInnerTexts()).toEqual(["Copy code", "Change language", "Delete block"]);
  await items.filter({ hasText: "Change language" }).click();
  await expect(menu(h.page)).toBeVisible();
  // Focus lands a frame after the menu shows; a key before that misses it.
  await expect(menu(h.page)).toBeFocused();
  await expect(h.page.locator(".code-ctx-menu")).toHaveCount(0);
  await menu(h.page).getByRole("menuitemradio", { name: "Python" }).click();
  await expect(label(h.page)).toHaveText(/Python/);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("```python"));
  expect(h.pageErrors).toEqual([]);
});

// The press lands on the menu's backdrop, as every menu's does: it closes the
// menu and goes no further, so the caret stays where it was.
test("a press outside closes it", async () => {
  const para = await h.page.locator("[data-block-type='p']").first().boundingBox();
  await h.page.locator(".code-block").first().hover();
  await label(h.page).click();
  await expect(menu(h.page)).toBeVisible();
  // Focus lands a frame after the menu shows; a key before that misses it.
  await expect(menu(h.page)).toBeFocused();
  await h.page.mouse.click(para!.x + 10, para!.y + para!.height / 2);
  await expect(menu(h.page)).toHaveCount(0);
  await expect(label(h.page)).toHaveText(/Plain text/);
  expect(h.pageErrors).toEqual([]);
});

// A fence typed with its language opens in it (2026-09-19). The info string is
// kept exactly as typed — ```js stays `js` on disk, as it does in Obsidian,
// where the file is the document — and the corner resolves it for reading.
test("```js and a space opens a JavaScript block, and the file keeps js", async () => {
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("```js ");
  await expect(h.page.locator("textarea.code-textarea").first()).toBeFocused();
  await h.page.keyboard.type("let a = 1;");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("let a"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toContain("```js\nlet a = 1;\n```");
  await expect(label(h.page).first()).toHaveText(/JavaScript/);
  expect(h.pageErrors).toEqual([]);
});

test("```py and Enter opens a Python block", async () => {
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("```py");
  await h.page.keyboard.press("Enter");
  await expect(h.page.locator("textarea.code-textarea").first()).toBeFocused();
  await expect(label(h.page).first()).toHaveText(/Python/);
  await h.page.keyboard.type("x = 1");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("x = 1"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toContain("```py\nx = 1\n```");
  expect(h.pageErrors).toEqual([]);
});

// The menu reads the same file the label does, and choosing the language the
// block already has writes nothing: `js` is not rewritten to `javascript`.
test("an imported ```js block reads JavaScript, and re-picking it leaves the file alone", async () => {
  const imported = "Intro.\n\n```js\nlet a = 1;\n```\n";
  const g = await launchApp({ "Imported.md": imported });
  try {
    await g.openNote("Imported");
    await expect(label(g.page)).toHaveText(/JavaScript/);
    await g.page.locator(".code-block").first().hover();
    await label(g.page).click();
    const checked = menu(g.page).locator('[role="menuitemradio"][aria-checked="true"]');
    await expect(checked).toHaveText("JavaScript");
    await checked.click();
    await expect(menu(g.page)).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(g.vault.read("Imported.md")).toBe(imported);
    expect(g.pageErrors).toEqual([]);
  } finally {
    await g.close();
  }
});

// `md` is Markdown: its label, its tick and its colours; re-picking it writes nothing.
test("an imported ```md block reads Markdown, coloured, and re-picking it leaves the file alone", async () => {
  const imported = "Intro.\n\n```md\n# Heading 1\n```\n";
  const g = await launchApp({ "Imported.md": imported });
  try {
    await g.openNote("Imported");
    await expect(label(g.page)).toHaveText(/Markdown/);
    await expect(g.page.locator(".code-overlay .token").first()).toBeAttached();
    await g.page.locator(".code-block").first().hover();
    await label(g.page).click();
    const checked = menu(g.page).locator('[role="menuitemradio"][aria-checked="true"]');
    await expect(checked).toHaveText("Markdown");
    await checked.click();
    await expect(menu(g.page)).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(g.vault.read("Imported.md")).toBe(imported);
    expect(g.pageErrors).toEqual([]);
  } finally {
    await g.close();
  }
});

// A code block's first row is its frame's toolbar, not its first line of code
// (a toolbar's height lower): the grip stands level with the language and copy
// buttons, for code, an empty block and a diagram alike.
test("the grip stands level with a code block's toolbar", async () => {
  const long = "word ".repeat(80).trim();
  const g = await launchApp({
    "Grip.md": `Intro.\n\n\`\`\`\n${long}\nnext\n\`\`\`\n\nMid.\n\n\`\`\`js\n\`\`\`\n\nEnd.\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n`,
  });
  try {
    await g.openNote("Grip");
    const blocks = g.page.locator(".code-block");
    for (let i = 0; i < 3; i++) {
      const block = blocks.nth(i);
      await block.scrollIntoViewIfNeeded();
      const box = (await block.boundingBox())!;
      await g.page.mouse.move(box.x + 40, box.y + box.height - 8, { steps: 3 });
      const grip = g.page.locator('[data-testid="block-drag-handle"]');
      await grip.waitFor();
      const off = await block.evaluate((el) => {
        const gr = document
          .querySelector('[data-testid="block-drag-handle"]')!
          .getBoundingClientRect();
        const tr = el.querySelector(":scope > .code-tools")!.getBoundingClientRect();
        return gr.top + gr.height / 2 - (tr.top + tr.height / 2);
      });
      expect(Math.abs(off)).toBeLessThan(1);
    }
    expect(g.pageErrors).toEqual([]);
  } finally {
    await g.close();
  }
});

// Sixteen rows would cover half the note: the menu shows about ten and
// scrolls, opening with the block's own language in view, and a letter
// scrolls to its language.
test("the menu is capped and opens scrolled to the block's language", async () => {
  const g = await launchApp({ "R.md": "Intro.\n\n```r\nx <- 1\n```\n" });
  try {
    await g.openNote("R");
    await g.page.locator(".code-block").first().hover();
    await label(g.page).click();
    const m = menu(g.page);
    await expect(m).toBeFocused();
    const fits = (name: string) =>
      m.evaluate((el, n) => {
        const row = [...el.querySelectorAll('[role="menuitemradio"]')].find(
          (r) => r.textContent === n,
        )!;
        const a = el.getBoundingClientRect();
        const b = row.getBoundingClientRect();
        return b.top >= a.top && b.bottom <= a.bottom;
      }, name);
    const { scrollH, clientH } = await m.evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    expect(scrollH).toBeGreaterThan(clientH);
    expect(await fits("R")).toBe(true);
    expect(await fits("Plain text")).toBe(false);
    await g.page.keyboard.press("b");
    await expect.poll(() => fits("Bash")).toBe(true);
    expect(g.pageErrors).toEqual([]);
  } finally {
    await g.close();
  }
});

// A hover highlights the row where it is: scrolling to show a half-hidden row
// whole slid the list under the pointer, near the top or bottom edge. A key's
// move is still followed into view.
test("hovering a half-hidden row never scrolls the menu; a key still does", async () => {
  await h.page.locator(".code-block").first().hover();
  await label(h.page).click();
  const m = menu(h.page);
  await expect(m).toBeFocused();
  const scrollTop = () => m.evaluate((el) => el.scrollTop);
  // Scrolled a little, as a wheel leaves it: the first row half under the top edge.
  await m.evaluate((el) => {
    el.scrollTop = 14;
  });
  const before = await scrollTop();
  expect(before).toBe(14);
  const box = (await m.boundingBox())!;
  const firstBottom = await m.evaluate(
    (el) => el.querySelector('[role="menuitemradio"]')!.getBoundingClientRect().bottom,
  );
  await h.page.mouse.move(box.x + 40, firstBottom - 4, { steps: 4 });
  await expect(m).toHaveAttribute("aria-activedescendant", "code-lang-item-0");
  await h.page.waitForTimeout(150);
  expect(await scrollTop()).toBe(before);
  // A key's move is followed: Home shows the first row whole.
  await h.page.keyboard.press("Home");
  await expect.poll(scrollTop).toBeLessThan(before);
  expect(h.pageErrors).toEqual([]);
});
