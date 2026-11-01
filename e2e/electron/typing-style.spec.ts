/**
 * Formatting ends with its text. After a deletion, the next letters take the
 * formatting of where the caret now is, never a style Chromium remembers from
 * text that is gone: deleting all of `**this is bold**` and typing on wrote
 * `**this is normal**` to the file. Deleting part of a run, or typing over a
 * selection, keeps its formatting; ⌘B after a deletion still turns bold on.
 * Desktop behaviour; the phone (Gboard) is not yet verified.
 */
import { expect, type Page, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, isMac, launchApp, sleep, waitForFile } from "./harness";

const MOD = isMac ? "Meta" : "Control";
const NOTE = "Style.md";

/** The caret into block `n` (0-based), `back` characters before its end. */
async function caretIn(page: Page, n: number, back = 0) {
  await page.locator("[data-block-id]").nth(n).click();
  await page.keyboard.press(END_OF_LINE);
  for (let i = 0; i < back; i++) await page.keyboard.press("ArrowLeft");
}

/** Select `text` (its first occurrence) in block `n`. */
async function select(page: Page, n: number, text: string) {
  await page.evaluate(
    ([n, text]) => {
      const block = document.querySelectorAll("[data-block-id]")[n as number];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let all = "";
      const nodes: [Text, number][] = [];
      for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
        nodes.push([t, all.length]);
        all += t.data;
      }
      const from = all.indexOf(text as string);
      const to = from + (text as string).length;
      const at = (pos: number) => {
        for (const [t, start] of nodes)
          if (pos <= start + t.length) return [t, pos - start] as const;
        const [t] = nodes[nodes.length - 1];
        return [t, t.length] as const;
      };
      const [sn, so] = at(from);
      const [en, eo] = at(to);
      window.getSelection()!.setBaseAndExtent(sn, so, en, eo);
    },
    [n, text] as const,
  );
}

async function line(
  h: Awaited<ReturnType<typeof launchApp>>,
  n: number,
  want: (l: string) => boolean,
) {
  await waitForFile(h.vault.file(NOTE), (t) => want(t.split("\n")[n] ?? ""));
  await sleep(SETTLE_MS);
  return h.vault.read(NOTE).split("\n")[n];
}

const press = async (page: Page, key: string, times: number) => {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
};

test("a deleted run's style ends with it; a partial deletion and nesting keep what the caret is in", async () => {
  const md = [
    "Intro",
    "",
    "**this is bold**",
    "",
    "plain **bold** end",
    "",
    "plain **bold** end",
    "",
    "**a *b* c**",
    "",
  ].join("\n");
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Style");
    // The whole bold line, Backspace by Backspace.
    await caretIn(h.page, 1);
    const scroller = h.page.locator(".editor-scroll");
    const scrollBefore = await scroller.evaluate((e) => e.scrollTop);
    await press(h.page, "Backspace", "this is bold".length);
    // Setting the caret again neither scrolls the note nor moves focus.
    expect(await scroller.evaluate((e) => e.scrollTop)).toBe(scrollBefore);
    expect(await h.page.evaluate(() => document.activeElement?.hasAttribute("data-editor"))).toBe(
      true,
    );
    await h.page.keyboard.type("this is normal");
    expect(await line(h, 2, (l) => l.includes("normal"))).toBe("this is normal");

    // A bold word deleted mid-sentence.
    await caretIn(h.page, 2, " end".length);
    await press(h.page, "Backspace", 4);
    await h.page.keyboard.type("word");
    expect(await line(h, 4, (l) => l.includes("word"))).toBe("plain word end");

    // Part of the word deleted: still inside the bold, still bold.
    await caretIn(h.page, 3, " end".length);
    await press(h.page, "Backspace", 2);
    await h.page.keyboard.type("x");
    expect(await line(h, 6, (l) => l.includes("box"))).toBe("plain **box** end");

    // The italic inside bold deleted: the bold it sat in carries on.
    await caretIn(h.page, 4, " c**".length - 2);
    await press(h.page, "Backspace", 1);
    await h.page.keyboard.type("z");
    expect(await line(h, 8, (l) => l.includes("z"))).toBe("**a z c**");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a selection across styles, a cut, and typing over a selection", async () => {
  const md = [
    "Intro",
    "",
    "plain **bold** end",
    "",
    "cut **this** out",
    "",
    "over **this** word",
    "",
  ].join("\n");
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Style");
    // Bold and plain together, then Backspace.
    await caretIn(h.page, 1);
    await select(h.page, 1, "bold end");
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.type("new");
    expect(await line(h, 2, (l) => l.includes("new"))).toBe("plain new");

    // Cut is a deletion.
    await caretIn(h.page, 2);
    await select(h.page, 2, "this");
    await h.page.keyboard.press(`${MOD}+x`);
    await h.page.keyboard.type("that");
    // macOS's smart cut takes a space with the word; the style is the point.
    const cut = await line(h, 4, (l) => l.includes("that"));
    expect(cut).toContain("that");
    expect(cut).not.toContain("**");

    // Typing over a selection keeps its formatting: overtyping corrects a word.
    await caretIn(h.page, 3);
    await select(h.page, 3, "this");
    await h.page.keyboard.type("that");
    expect(await line(h, 6, (l) => l.includes("that"))).toBe("over **that** word");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("⌘B after a deletion still turns bold on; undo and redo, then typing, follow the caret", async () => {
  const md = ["Intro", "", "**gone**", "", "**kept**", ""].join("\n");
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Style");
    await caretIn(h.page, 1);
    await press(h.page, "Backspace", 4);
    await h.page.keyboard.press(`${MOD}+b`);
    await h.page.keyboard.type("again");
    expect(await line(h, 2, (l) => l.includes("again"))).toBe("**again**");

    await caretIn(h.page, 2);
    await press(h.page, "Backspace", 4);
    await h.page.keyboard.type("x");
    expect(await line(h, 4, (l) => l.includes("x"))).toBe("x");
    // Pressed until the file is there: the step count is undo's business.
    const pressUntil = async (key: string, want: string) => {
      for (let i = 0; i < 5 && h.vault.read(NOTE).split("\n")[4] !== want; i++) {
        await h.page.keyboard.press(key);
        await sleep(SETTLE_MS);
      }
      expect(h.vault.read(NOTE).split("\n")[4]).toBe(want);
    };
    await pressUntil(`${MOD}+z`, "**kept**");
    // Redo, then typing: the caret's own place decides, so plain.
    await pressUntil(`${MOD}+Shift+z`, "x");
    await caretIn(h.page, 2);
    await h.page.keyboard.type("y");
    expect(await line(h, 4, (l) => l.includes("y"))).toBe("xy");
    // Undo puts the bold back; typing at its end is inside it.
    await pressUntil(`${MOD}+z`, "**kept**");
    await caretIn(h.page, 2);
    await h.page.keyboard.type("!");
    expect(await line(h, 4, (l) => l.includes("!"))).toBe("**kept!**");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a cell and a callout body end a deleted run's style too", async () => {
  const md = "| A | B |\n| --- | --- |\n| x | **bold** |\n\n> [!note] Note\n> *it*\n";
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Style");
    const cell = h.page.locator("table.table-block tbody td").nth(1);
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await press(h.page, "Backspace", 4);
    await h.page.keyboard.type("plain");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("plain"));
    await sleep(SETTLE_MS);

    const body = h.page.locator(".callout-body");
    await body.click();
    await h.page.keyboard.press(END_OF_LINE);
    await press(h.page, "Backspace", 2);
    await h.page.keyboard.type("text");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("text"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "| A | B |\n| --- | --- |\n| x | plain |\n\n> [!note] Note\n> text\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
