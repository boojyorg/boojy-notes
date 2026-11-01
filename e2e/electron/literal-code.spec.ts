/**
 * A code span is literal, in the real app: nothing inside one is drawn as
 * formatting, a link or a tag, in a paragraph, a table cell or a callout, and
 * an untouched span keeps its spelling (its backtick runs, its padding) through
 * every edit beside it, an Enter split, undo and redo. Inside a span only code
 * itself acts: ⌘B there changes nothing.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, isMac, launchApp, sleep, waitForFile } from "./harness";

const MOD = isMac ? "Meta" : "Control";

const codeTexts = (scope: import("@playwright/test").Locator) =>
  scope.locator("code").allTextContents();

test("a paragraph's spans show their text literally and keep their spelling through edits, a split, undo and redo", async () => {
  const line = "A `**bold**` and ``code`` and `` `x` `` and `[[Beta]]` and `#tag`.";
  const h = await launchApp({ "Spans.md": `${line}\n`, "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Spans");
    const block = h.page.locator("[data-block-id]").first();
    expect(await codeTexts(block)).toEqual(["**bold**", "code", "`x`", "[[Beta]]", "#tag"]);
    await expect(block.locator("strong, .wikilink, .inline-tag")).toHaveCount(0);

    await block.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Spans.md"), (t) => t.includes("more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Spans.md")).toBe(`${line} more\n`);

    // Enter splits through the serialised read-back.
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("next");
    await waitForFile(h.vault.file("Spans.md"), (t) => t.includes("next"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Spans.md")).toBe(`${line} more\n\nnext\n`);

    // Undo all the way back, then redo all the way forward: the spans keep
    // their spelling at every step. (Pressed until the file is there, at most
    // five times: the step count is undo's business, not this spec's.)
    const pressUntil = async (key: string, want: string) => {
      for (let i = 0; i < 5 && h.vault.read("Spans.md") !== want; i++) {
        await h.page.keyboard.press(key);
        await sleep(SETTLE_MS);
      }
      expect(h.vault.read("Spans.md")).toBe(want);
    };
    await pressUntil(`${MOD}+z`, `${line}\n`);
    expect(await codeTexts(block)).toEqual(["**bold**", "code", "`x`", "[[Beta]]", "#tag"]);
    await pressUntil(`${MOD}+Shift+z`, `${line} more\n\nnext\n`);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typed backticks make a literal span; typed markers outside it still format", async () => {
  const h = await launchApp({ "Typed.md": "Start\n" });
  try {
    await h.openNote("Typed");
    const block = h.page.locator("[data-block-id]").first();
    await block.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" `**x**` then **y**");
    await waitForFile(h.vault.file("Typed.md"), (t) => t.includes("**y**"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Typed.md")).toBe("Start `**x**` then **y**\n");
    expect(await codeTexts(block)).toEqual(["**x**"]);
    await expect(block.locator("strong")).toHaveText("y");
    await expect(block.locator("code strong")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("⌘B inside a span changes nothing; around whole spans it bolds them nested", async () => {
  const h = await launchApp({ "Bold.md": "say `literal` now\n" });
  try {
    await h.openNote("Bold");
    const block = h.page.locator("[data-block-id]").first();
    await block.click();
    // A selection inside the span's text: "ter".
    await h.page.evaluate(() => {
      const text = document.querySelector("[data-block-id] code")!.firstChild!;
      const range = document.createRange();
      range.setStart(text, 2);
      range.setEnd(text, 5);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await h.page.keyboard.press(`${MOD}+b`);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Bold.md")).toBe("say `literal` now\n");
    await expect(block.locator("strong")).toHaveCount(0);

    // The whole line, the span among words: bold wraps it, code nested.
    await h.page.evaluate(() => {
      const block = document.querySelector("[data-block-id]")!;
      const range = document.createRange();
      range.setStart(block.firstChild!, 0);
      range.setEnd(block.lastChild!, block.lastChild!.textContent!.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await h.page.keyboard.press(`${MOD}+b`);
    await waitForFile(h.vault.file("Bold.md"), (t) => t.includes("**"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Bold.md")).toBe("**say `literal` now**\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a table cell's span is literal, an escaped pipe in it shows as a pipe, and both survive an edit beside them", async () => {
  const table = [
    "| You want | You type |",
    "| --- | --- |",
    "| Bold | `**bold**` |",
    "| Pipe | `a\\|b` |",
    "| Inline code | `` `code` `` |",
  ];
  const h = await launchApp({ "Cheat.md": `${table.join("\n")}\n` });
  try {
    await h.openNote("Cheat");
    const grid = h.page.locator("table.table-block");
    expect(await codeTexts(grid)).toEqual(["**bold**", "a|b", "`code`"]);
    await expect(grid.locator("strong")).toHaveCount(0);

    const cell = grid.locator("tbody td").first();
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Cheat.md"), (t) => t.includes("Bold!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Cheat.md")).toBe(
      `${[table[0], table[1], "| Bold! | `**bold**` |", table[3], table[4]].join("\n")}\n`,
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a callout body's span is literal and keeps its spelling through an edit", async () => {
  const callout = "> [!note] Note\n> see `[[Other]]` and ``a ` tick`` here";
  const h = await launchApp({ "Call.md": `${callout}\n`, "Other.md": "Other.\n" });
  try {
    await h.openNote("Call");
    const body = h.page.locator(".callout-body");
    expect(await codeTexts(body)).toEqual(["[[Other]]", "a ` tick"]);
    await expect(body.locator(".wikilink")).toHaveCount(0);
    await body.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" too");
    await waitForFile(h.vault.file("Call.md"), (t) => t.includes("too"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Call.md")).toBe(`${callout} too\n`);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
