/**
 * What a copy puts on the clipboard, in the real app.
 *
 * A run of whole blocks copied and pasted into Obsidian arrived as plain
 * lines: the plain-text payload was the words with every Markdown marker
 * stripped, and the HTML payload had its headings and list items unwrapped
 * to line breaks (2026-09-16). Now a whole-block copy carries the Markdown
 * as plain text and the structure as block HTML; an ordinary selection
 * inside a block's text carries the visible text and inline HTML; and the
 * app's own paste still reads its private format first.
 *
 * These are payload assertions, made on the event's DataTransfer: nothing
 * here reaches the OS clipboard or another app.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const MODULE =
  "# PSYC327\n## Assessments\n30% Coursework – Blog\n\n70% Online Exam\n- Psychology module\n";

type Payload = { text: string; html: string; blocks: string };

type RangeArgs = { start: number; startOffset?: number; end: number; endOffset?: number };

/**
 * Select from block `start` into block `end` (whole roots unless an offset
 * into the root's first text node is given) and dispatch a copy.
 */
const copyRange = (args: RangeArgs): Payload => {
  const roots = document.querySelectorAll("[data-editor] [data-block-id]");
  const range = document.createRange();
  if (args.startOffset === undefined) range.setStartBefore(roots[args.start].firstChild!);
  else range.setStart(roots[args.start].firstChild!, args.startOffset);
  if (args.endOffset === undefined) range.setEndAfter(roots[args.end].lastChild!);
  else range.setEnd(roots[args.end].firstChild!, args.endOffset);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  const dt = new DataTransfer();
  document
    .querySelector("[data-editor]")!
    .dispatchEvent(
      new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  return {
    text: dt.getData("text/plain"),
    html: dt.getData("text/html"),
    blocks: dt.getData("text/boojy-blocks"),
  };
};

test("whole blocks copy as their Markdown and as block HTML, and paste back through the private format", async () => {
  const h = await launchApp({ "Module.md": MODULE, "Target.md": "" });
  try {
    await h.openNote("Module");
    await h.page.locator("[data-block-id]").first().waitFor();
    const copied = await h.page.evaluate(copyRange, { start: 0, end: 4 });
    // The app's spelling, not the file's: one blank line between blocks.
    expect(copied.text).toBe(
      "# PSYC327\n\n## Assessments\n\n30% Coursework – Blog\n\n70% Online Exam\n\n- Psychology module",
    );
    expect(copied.html).toBe(
      "<h1>PSYC327</h1><h2>Assessments</h2><p>30% Coursework – Blog</p><p>70% Online Exam</p><ul><li>Psychology module</li></ul>",
    );
    expect(JSON.parse(copied.blocks)).toHaveLength(5);

    // Boojy to Boojy: the private format is what lands, so the plain text
    // could say anything.
    await h.openNote("Target");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.evaluate((c) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "not this");
      dt.setData("text/html", c.html);
      dt.setData("text/boojy-blocks", c.blocks);
      document
        .querySelector("[data-editor]")!
        .dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
    }, copied);
    await waitForFile(h.vault.file("Target.md"), (t) => t.includes("Psychology"));
    await sleep(SETTLE_MS);
    // The file ends where the last pasted block ends: the final newline is the
    // empty last row, and the paste made none.
    expect(h.vault.read("Target.md")).toBe(copied.text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an ordinary selection inside a block is its visible text, no marker added", async () => {
  const h = await launchApp({ "Module.md": MODULE });
  try {
    await h.openNote("Module");
    await h.page.locator("[data-block-id]").first().waitFor();
    const inside = await h.page.evaluate(copyRange, {
      start: 0,
      startOffset: 4,
      end: 0,
      endOffset: 7,
    });
    expect(inside.text).toBe("327");
    expect(inside.html).toBe("327");
    expect(inside.blocks).toBe("");

    // From the middle of the heading into the next: two blocks touched, none
    // wholly selected, so still text.
    const across = await h.page.evaluate(copyRange, {
      start: 0,
      startOffset: 4,
      end: 1,
      endOffset: 6,
    });
    expect(across.text).toBe("327\nAssess");
    expect(across.html).toBe("327<br>Assess");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("links leave the editor's decorations behind; a wikilink keeps its notation", async () => {
  const md = "read [docs](https://x.com) then [[Beta]] and [[Beta|B]] #tag\n\nend\n";
  const h = await launchApp({ "Links.md": md, "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Links");
    await h.page.locator("[data-block-id]").first().waitFor();
    const whole = await h.page.evaluate(copyRange, { start: 0, end: 1 });
    expect(whole.text).toBe(md.trimEnd());
    expect(whole.html).toBe(
      '<p>read <a href="https://x.com">docs</a> then [[Beta]] and [[Beta|B]] #tag</p><p>end</p>',
    );

    const inside = await h.page.evaluate(copyRange, {
      start: 0,
      startOffset: 0,
      end: 0,
      endOffset: 5,
    });
    expect(inside.text).toBe("read ");
    // The whole first block as an ordinary (single-block) selection.
    const block = await h.page.evaluate(copyRange, { start: 0, end: 0 });
    expect(block.text).toBe("read docs then [[Beta]] and [[Beta|B]] #tag");
    expect(block.html).toBe(
      'read <a href="https://x.com">docs</a> then [[Beta]] and [[Beta|B]] #tag',
    );
    expect(block.html).not.toContain("↗");
    expect(block.blocks).toBe("");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
