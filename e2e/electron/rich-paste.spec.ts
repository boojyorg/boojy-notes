/**
 * A paste of several formatted lines keeps its formatting (2026-09-24).
 *
 * A single line pasted from a browser kept its bold, italics and links, but a
 * paste of several lines read `text/plain` only and arrived as bare text. The
 * clipboard's HTML is now read as Markdown blocks first (`richPasteMarkdown`),
 * unless it carries no formatting of its own: an editor's colour spans stay
 * the plain text they were, or a pasted fence would come apart line by line.
 *
 * The paste is dispatched with a DataTransfer carrying both formats, which is
 * what a real paste from another app delivers; the assertion is the file.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp, waitForFile } from "./harness";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ "P.md": "Start\n" });
  await h.openNote("P");
  await h.page.locator('[data-block-type="p"]', { hasText: "Start" }).click();
  await h.page.keyboard.press("End");
  await h.page.keyboard.press("Enter");
});

test.afterEach(async () => {
  await h?.close();
});

/** Paste `plain` and `html` at the caret, as another app's copy would. */
const paste = (plain: string, html: string) =>
  h.page.evaluate(
    ([p, m]) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", p);
      dt.setData("text/html", m);
      const ev = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement as HTMLElement).dispatchEvent(ev);
    },
    [plain, html],
  );

test("several formatted lines from a browser keep their bold, italics, links and list", async () => {
  await paste(
    "bold one\n\nitalic two\n\nlink three\n\nfirst\nsecond",
    '<p><b>bold</b> one</p><p><i>italic</i> two</p><p><a href="https://example.com">link</a> three</p>' +
      "<ul><li>first</li><li><strong>second</strong></li></ul>",
  );
  const text = await waitForFile(h.vault.file("P.md"), (t) => t.includes("**second**"), {
    label: "the paste to be written",
  });
  expect(text).toBe(
    "Start\n\n**bold** one\n\n*italic* two\n\n[link](https://example.com) three\n\n- first\n- **second**\n",
  );
  // And on screen: the pasted words are formatted, not literal asterisks.
  await expect(h.page.locator("[data-editor] strong", { hasText: "bold" })).toBeVisible();
  await expect(h.page.locator("[data-editor] em", { hasText: "italic" })).toBeVisible();
  expect(h.pageErrors).toEqual([]);
});

test("an editor's unformatted HTML pastes as its plain text, so a code fence stays whole", async () => {
  const code = "```js\nlet a = 1;\nlet b = 2;\n```";
  await paste(
    code,
    '<div style="color: #d4d4d4;"><div><span style="color: #569cd6;">```js</span></div>' +
      "<div><span>let a = 1;</span></div><div><span>let b = 2;</span></div><div><span>```</span></div></div>",
  );
  const text = await waitForFile(h.vault.file("P.md"), (t) => t.includes("let b"), {
    label: "the paste to be written",
  });
  // The fence arrives whole: one code block, its lines as copied, a blank
  // line under the paragraph as the writer puts between any two blocks.
  expect(text).toBe(`Start\n\n${code}\n`);
  await expect(h.page.locator('[data-block-type="code"]')).toHaveCount(1);
  expect(h.pageErrors).toEqual([]);
});
