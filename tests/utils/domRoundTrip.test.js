/**
 * @vitest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { markdownToBlocks } from "../../src/utils/markdown.js";
import {
  domNodeToMarkdown,
  htmlToInlineMarkdown,
  inlineMarkdownToHtml,
  sanitizeInlineHtml,
} from "../../src/utils/inlineFormatting.js";
import { isEditableBlock } from "../../src/utils/domHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// THE DOM ROUND TRIP: MARKDOWN → BLOCK → DOM → READ-BACK → MARKDOWN
//
// The fourth Markdown contract. preservation.test.js proves the converters
// alone (markdownToBlocks → blocksToMarkdown) keep a file's bytes, but a text
// block's bytes take a longer road the moment it is edited: block.text is
// rendered to HTML (inlineMarkdownToHtml), painted into a contentEditable,
// and after the keystroke read back from the DOM (domNodeToMarkdown on the
// live element; sanitizeInlineHtml + htmlToInlineMarkdown on serialised HTML
// for a copy, an Enter split or a paste). Anything that road changes is a
// byte the app rewrites on the first edit of that block, invisible to the
// converter-only suite. The 2026-09-07 review found four such bytes (§3.5):
// a zero-width space the file held, whitespace-only emphasis, a ↗ in a link's
// text and an explicit [url](url).
//
// The contract: for every text block of every preservation fixture, and for
// the inline cases below, both read-back paths return block.text unchanged.
// A change the renderer itself makes (an inline parse that mis-reads the
// Markdown) fails here too and is marked it.fails with its cause: that is the
// Markdown class, not the DOM seam, and is the honest record until fixed.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "preservation",
);

/** block.text after the road a keystroke sends it down, both read-back paths. */
function roundTrips(text) {
  const el = document.createElement("p");
  el.innerHTML = inlineMarkdownToHtml(text);
  return {
    live: domNodeToMarkdown(el),
    serialised: htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)),
  };
}

function expectRoundTrip(text) {
  const { live, serialised } = roundTrips(text);
  expect(live, "live DOM read-back").toBe(text);
  expect(serialised, "serialised read-back").toBe(text);
}

describe("every text block of the preservation corpus survives the DOM", () => {
  // Fixture → why its text blocks do not yet survive. Each is the inline
  // renderer's reading of the Markdown, not the DOM read-back.
  const KNOWN_FAILURES = {};

  const fixtures = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".md"));
  for (const name of fixtures) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
    const texts = markdownToBlocks(raw)
      .filter((b) => isEditableBlock(b) && b.text)
      .map((b) => b.text);
    const run = KNOWN_FAILURES[name] ? it.fails : it;
    run(`${name} (${texts.length} text blocks)`, () => {
      for (const text of texts) expectRoundTrip(text);
    });
  }
});

describe("inline bytes that only the DOM road could corrupt", () => {
  const cases = [
    // §3.5: the walkers stripped every U+200B as if it were the caret anchor.
    "zero-width​space",
    "**bold​** and [[Note​]]",
    // §3.5: whitespace-only emphasis and code spans vanished.
    "a * * b",
    "a ** ** b",
    "x `  ` y",
    "~~ ~~ and == ==",
    // §3.5: a ↗ in link text was taken for the decorative icon and deleted.
    "go [north ↗](https://x.com) now",
    "plain ↗ arrow",
    // §3.5: [url](url) collapsed to a bare URL, which is not a link in CommonMark.
    "[https://example.com](https://example.com)",
    "bare https://example.com autolink",
    // Ordinary inline Markdown, so a regression in the common case shows here first.
    "**bold**, *italic*, ***both***, `code`, ~~gone~~, ==lit==",
    "[[Welcome]] and [[Welcome|alias]] and #tag",
    "[text](https://x.com/a?b=c&d=e) and https://x.com/path",
    "\\*not italic\\* and \\# and \\[bracket\\]",
    "soft\nbreak\nlines",
    "trailing space ",
    "a < b & c > d",
  ];
  for (const text of cases) {
    it(JSON.stringify(text), () => expectRoundTrip(text));
  }
});

describe("inline Markdown the renderer mis-reads (the Markdown class, not the DOM seam)", () => {
  // Each of these is corrupted by inlineMarkdownToHtml's parse, before any
  // DOM is involved; the DOM read-back is faithful to what was rendered. Kept
  // as it.fails so the fix turns them red: remove the marker then.
  const cases = [
    // An autolink `<https://…>` is escaped to &lt;…&gt; and the bare-URL pass
    // then links `https://example.com&gt`, growing a `;` on every edit.
    "<https://example.com>",
    // A bare URL inside a link's text is autolinked inside the anchor.
    "[see https://a.com here](https://b.com)",
  ];
  for (const text of cases) {
    it.fails(JSON.stringify(text), () => expectRoundTrip(text));
  }
});
