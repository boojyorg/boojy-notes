/**
 * Backslash escapes: `\*` is drawn as the star alone, one sealed character,
 * and the file keeps its backslash however the line around it is edited.
 * The caret steps over it in one move; Backspace takes the symbol and its
 * backslash together; `\` then `*` typed seals at once, bytes unchanged.
 *
 * Needs the real app: what Chromium does with a caret beside, and a
 * Backspace into, a `contenteditable="false"` element is the point.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  START_OF_LINE,
  blockTypes,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Escapes.md";

/** What the first block shows, sealed symbols as themselves. */
const shown = (h: AppHandle, i = 0) =>
  h.page
    .locator("[data-block-id]")
    .nth(i)
    .evaluate((el) => (el as HTMLElement).innerText.replace(/​/g, "").replace(/\n$/, ""));

/** The file once it holds `pred`, and settled. */
async function fileOnce(h: AppHandle, pred: (t: string) => boolean): Promise<string> {
  await waitForFile(h.vault.file(NOTE), pred);
  await sleep(SETTLE_MS);
  return h.vault.read(NOTE);
}

async function caretAtStart(h: AppHandle, i = 0) {
  await h.page.locator("[data-block-id]").nth(i).click();
  await h.page.keyboard.press(START_OF_LINE);
}

test("an escape shows its symbol alone, and an edit beside it keeps the backslash", async () => {
  const h = await launchApp({ [NOTE]: "\\# not a heading and \\*not italic\\*\n" });
  try {
    await h.openNote("Escapes");
    expect(await shown(h)).toBe("# not a heading and *not italic*");
    expect(await h.page.locator(".md-escape").count()).toBe(3);

    // One arrow press crosses the sealed #; the letter lands after it.
    await caretAtStart(h);
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.type("X");
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" end");
    expect(await fileOnce(h, (t) => t.includes("end"))).toBe(
      "\\#X not a heading and \\*not italic\\* end\n",
    );

    // Read back from the disk, the line is still a paragraph, not a heading.
    await h.restart();
    await h.openNote("Escapes");
    // The paragraph, then the empty row the editor always keeps last.
    expect((await blockTypes(h.page))[0]).toBe("p");
    expect(await shown(h)).toBe("#X not a heading and *not italic* end");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Backspace and Delete take the symbol with its backslash, alone or in a selection", async () => {
  const h = await launchApp({ [NOTE]: "a\\*b\\*c\n\none \\* two \\~ three\n" });
  try {
    await h.openNote("Escapes");
    // After the first sealed star: Backspace removes it, backslash and all.
    await caretAtStart(h);
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("Backspace");
    // Before the second: Delete removes it.
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("Delete");
    expect(await shown(h)).toBe("abc");

    // A selection across two escapes goes in one press.
    await caretAtStart(h, 1);
    for (let i = 0; i < 4; i++) await h.page.keyboard.press("ArrowRight");
    for (let i = 0; i < 8; i++) await h.page.keyboard.press("Shift+ArrowRight");
    await h.page.keyboard.press("Backspace");
    expect(await fileOnce(h, (t) => t.startsWith("abc"))).toBe("abc\n\none three\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a typed backslash and symbol seal at once, and undo and redo keep the file's meaning", async () => {
  const h = await launchApp({ [NOTE]: "The\n" });
  try {
    await h.openNote("Escapes");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" \\*no\\* \\\\*it* x");
    // Two sealed stars, a sealed backslash, and an italic after it.
    expect(await shown(h)).toBe("The *no* \\it x");
    expect(await h.page.locator(".md-escape").count()).toBe(3);
    expect(await h.page.locator("[data-block-id] em").textContent()).toBe("it");
    const typed = "The \\*no\\* \\\\*it* x\n";
    expect(await fileOnce(h, (t) => t.includes("it* x"))).toBe(typed);

    // Undo takes the typing away; redo brings back the same bytes, sealed.
    await h.page.keyboard.press(`${MOD}+z`);
    expect(await fileOnce(h, (t) => t === "The\n")).toBe("The\n");
    await h.page.keyboard.press(`${MOD}+Shift+z`);
    expect(await fileOnce(h, (t) => t === typed)).toBe(typed);
    expect(await h.page.locator(".md-escape").count()).toBe(3);

    // An edit after the redo writes the escapes back as they were.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" end");
    expect(await fileOnce(h, (t) => t.includes("end"))).toBe("The \\*no\\* \\\\*it* x end\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a code span, a link's address and a wikilink keep their backslashes in view", async () => {
  const h = await launchApp({
    [NOTE]: "`a\\*b` and [x \\* y](https://a.com/\\*b) and [[Missing\\#1]]\n",
  });
  try {
    await h.openNote("Escapes");
    expect(await h.page.locator("[data-block-id] code").textContent()).toBe("a\\*b");
    expect(await h.page.locator("[data-block-id] a").getAttribute("href")).toBe(
      "https://a.com/\\*b",
    );
    expect(await h.page.locator(".wikilink").textContent()).toBe("Missing\\#1");
    // The link's words draw their escape sealed.
    expect(await h.page.locator("[data-block-id] a .md-escape").count()).toBe(1);

    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" end");
    expect(await fileOnce(h, (t) => t.includes("end"))).toBe(
      "`a\\*b` and [x \\* y](https://a.com/\\*b) and [[Missing\\#1]] end\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an escaped quote in a link's address never becomes a live attribute", async () => {
  // Put back after the attribute encoding ran, a bare `"` closed the href and
  // the rest became an event handler that ran on hover.
  const h = await launchApp({
    [NOTE]:
      '[hover](https://a.com/\\" onmouseover="document.body.dataset.owned=1) and https://b.com/\\"onmouseover=\\"document.body.dataset.owned=2\n',
  });
  try {
    await h.openNote("Escapes");
    for (const link of await h.page.locator("[data-block-id] a").all()) await link.hover();
    await sleep(200);
    expect(await h.page.evaluate(() => document.body.dataset.owned ?? null)).toBeNull();
    const handlers = await h.page.evaluate(() =>
      [...document.querySelectorAll("[data-block-id] *")].flatMap((el) =>
        [...el.attributes].map((a) => a.name).filter((n) => n.startsWith("on")),
      ),
    );
    expect(handlers).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a table cell keeps its escape through an edit", async () => {
  const h = await launchApp({ [NOTE]: "| a \\* b | c |\n| --- | --- |\n| 1 | 2 |\n" });
  try {
    await h.openNote("Escapes");
    const cell = h.page.locator("[data-inline-field]").first();
    expect(await cell.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe("a * b");
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    expect(await fileOnce(h, (t) => t.includes("b!"))).toContain("| a \\* b! |");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a copy inside a line is its visible symbol; whole blocks are their Markdown", async () => {
  const h = await launchApp({ [NOTE]: "say \\*hi\\* now\n\nnext\n" });
  try {
    await h.openNote("Escapes");
    await h.page.locator("[data-block-id]").first().waitFor();
    const copy = (whole: boolean) =>
      h.page.evaluate((whole) => {
        const roots = document.querySelectorAll("[data-editor] [data-block-id]");
        const range = document.createRange();
        range.setStartBefore(roots[0].firstChild!);
        if (whole) range.setEndAfter(roots[1].lastChild!);
        else range.setEndAfter(roots[0].lastChild!.previousSibling ?? roots[0].lastChild!);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        const dt = new DataTransfer();
        document
          .querySelector("[data-editor]")!
          .dispatchEvent(
            new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }),
          );
        return dt.getData("text/plain");
      }, whole);
    expect(await copy(false)).toBe("say *hi*");
    expect(await copy(true)).toBe("say \\*hi\\* now\n\nnext");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
