/**
 * Inline bytes through the live DOM. A text block's Markdown is rendered into
 * a contentEditable and read back from it after every keystroke, and on a
 * copy, an Enter split or a paste through Chromium's own serialisation. The
 * converter suites never take that road; these are the bytes it alone could
 * corrupt (review 2026-09-07 §3.5, §3.6), proven in the real app:
 *
 *  - a rich single-line paste (bold, a link) lands inline in the paragraph,
 *    the spaces around it plain spaces; the sanitiser once returned a <div>
 *    that insertHTML split into blocks, everything after the pasted word was
 *    lost from the file, and insertHTML wrote the space before the paste as
 *    a non-breaking U+00A0;
 *  - a U+200B the file holds is kept, while the editor's own caret anchor
 *    (the same character, after a link) never reaches the file: the anchor is
 *    a marked element, not a bare character;
 *  - whitespace-only emphasis and a ↗ inside a link's text survive an edit;
 *  - a URL in angle brackets, one ending in `&` and one inside a link's text
 *    survive an edit: the bare-URL pass once ran over the escaped HTML, so
 *    `<https://example.com>` grew a `;` on every edit and a URL inside a
 *    link's text was linked again inside the anchor and read back as two.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const ZWSP = "​";

test("a rich single-line paste lands inline, with everything around it kept", async () => {
  const h = await launchApp({ "Paste.md": "start end\n" });
  try {
    await h.openNote("Paste");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("Home");
    for (let i = 0; i < "start".length; i++) await h.page.keyboard.press("ArrowRight");
    await h.page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", " bold and link");
      dt.setData("text/html", ' <b>bold</b> and <a href="https://x.com">link</a>');
      document
        .querySelector("[data-editor]")!
        .dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
    });
    await waitForFile(h.vault.file("Paste.md"), (t) => t.includes("bold"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Paste.md")).toBe("start **bold** and [link](https://x.com) end\n");
    // One paragraph still (plus the file's trailing empty line), no split.
    expect(await h.page.locator("[data-block-id]").count()).toBe(2);
    // Typing after the paste continues the same paragraph.
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Paste.md"), (t) => t.includes("!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Paste.md")).toBe("start **bold** and [link](https://x.com) end!\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the file's own zero-width space is kept; the caret anchor after a link never reaches the file", async () => {
  const md = `zero-width${ZWSP}space [[Beta]]\n`;
  const h = await launchApp({ "Alpha.md": md, "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    // End leaves Chromium's caret inside the wikilink; the keystroke moves it
    // onto the anchor after the link and the text lands outside.
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe(`zero-width${ZWSP}space [[Beta]] more\n`);

    // Enter splits the block through the serialised read-back path, with the
    // anchor still in the DOM: the file's byte stays, the anchor's does not.
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("next");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("next"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe(`zero-width${ZWSP}space [[Beta]] more\n\nnext\n`);

    // A copy of the first block carries neither the anchor nor the icon.
    const copied = await h.page.evaluate(() => {
      const block = document.querySelector("[data-block-id]")!;
      const range = document.createRange();
      range.selectNodeContents(block);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const dt = new DataTransfer();
      document
        .querySelector("[data-editor]")!
        .dispatchEvent(
          new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      return { text: dt.getData("text/plain"), html: dt.getData("text/html") };
    });
    expect(copied.text).toBe(`zero-width${ZWSP}space Beta more`);
    expect(copied.html).not.toContain("caret-anchor");
    expect(copied.html.split(ZWSP).length - 1).toBe(1);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("whitespace-only emphasis and a ↗ in link text survive an edit", async () => {
  const h = await launchApp({
    "Ws.md": "a * * b and `  ` c\n",
    "Arrow.md": "go [north ↗](https://x.com) now\n",
  });
  try {
    for (const [name, before] of [
      ["Ws", "a * * b and `  ` c"],
      ["Arrow", "go [north ↗](https://x.com) now"],
    ] as const) {
      await h.openNote(name);
      await h.page.locator("[data-block-id]").first().click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.type("!");
      await waitForFile(h.vault.file(`${name}.md`), (t) => t.includes("!"));
      await sleep(SETTLE_MS);
      expect(h.vault.read(`${name}.md`)).toBe(`${before}!\n`);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a URL in angle brackets, one ending in &, and one inside a link's text survive an edit", async () => {
  const before =
    "see <https://example.com> then https://x.com/?a& then [see https://a.com here](https://b.com) end";
  const h = await launchApp({ "Urls.md": `${before}\n` });
  try {
    await h.openNote("Urls");
    const block = h.page.locator("[data-block-id]").first();
    // Three links, one each: the brackets are text, the link's text holds its URL as text.
    expect(
      await block.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))),
    ).toEqual(["https://example.com", "https://x.com/?a&", "https://b.com"]);
    await expect(block).toHaveText(
      "see <https://example.com↗> then https://x.com/?a&↗ then see https://a.com here↗ end",
    );
    // The block's centre is a link; click its first word, not the link.
    await block.click({ position: { x: 6, y: 10 } });
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Urls.md"), (t) => t.includes("!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Urls.md")).toBe(`${before}!\n`);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
