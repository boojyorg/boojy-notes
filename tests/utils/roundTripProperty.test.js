/** @vitest-environment jsdom */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  domNodeToMarkdown,
  htmlToInlineMarkdown,
  inlineMarkdownToHtml,
  sanitizeInlineHtml,
} from "../../src/utils/inlineFormatting.js";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
} from "../../src/utils/markdown.js";
import { KNOWN_INLINE, known } from "./knownRewrites.js";
import { inlineText, markdownDocument } from "./markdownArbitraries.js";

// ─────────────────────────────────────────────────────────────────────────────
// GENERATED DOCUMENTS (property tests)
//
// The preservation corpus checks hand-written files one at a time; these
// check the same promises over documents built from the parser's own edge
// cases (markdownArbitraries.js), thousands of ways:
//
//   1. Saving twice writes what saving once wrote, for every document.
//   2. A document survives load → save byte for byte, unless it holds a
//      known rewrite (KNOWN, each a backlog line; delete its entry when the
//      rewrite is fixed, and the property guards it from then on).
//   3. Editing one paragraph changes only that paragraph's line.
//   4. Inline text survives being painted and read back (both read-backs).
//
// A failure prints the smallest document fast-check could shrink it to: add
// it to tests/fixtures/preservation/ as a fixture (fixed, KNOWN_FAILURES, or
// sanctioned in the spec), never weaken the property.
//
// CI runs a few hundred documents per property on one fixed seed, so a run is
// the same on every machine and never fails at random. Hunting is local:
// `FC_RUNS=20000 pnpm vitest run roundTripProperty` draws a new seed each
// time (printed with a failure), and `FC_SEED` replays one.
// ─────────────────────────────────────────────────────────────────────────────

const runs = Number(process.env.FC_RUNS) || 300;
const seed = process.env.FC_SEED
  ? Number(process.env.FC_SEED)
  : process.env.FC_RUNS
    ? undefined
    : 20261005;
const options = { numRuns: runs, ...(seed === undefined ? {} : { seed }) };
// The edit property discards most documents it draws, so it runs longest.
const timeout = Math.max(5_000, runs * 10);

/** load → save, as the desktop path does (electron/noteFileManager.js). */
const save = (raw) => applyEol(blocksToMarkdown(markdownToBlocks(raw)), detectEol(raw));

describe("generated documents", () => {
  it(
    "saving twice writes what saving once wrote",
    () => {
      fc.assert(
        fc.property(markdownDocument, (doc) => {
          const once = save(doc);
          expect(save(once)).toBe(once);
        }),
        options,
      );
    },
    timeout,
  );

  it(
    "a document survives load → save byte for byte, unless it holds a known rewrite",
    () => {
      fc.assert(
        fc.property(markdownDocument, (doc) => {
          fc.pre(!known(doc));
          expect(save(doc)).toBe(doc);
        }),
        options,
      );
    },
    timeout,
  );

  it(
    "editing one paragraph changes only that paragraph's line",
    () => {
      const withMarker = fc
        .tuple(markdownDocument, markdownDocument)
        .map(([before, after]) => `${before.replace(/(\r?\n)*$/, "")}\n\nEDITME here.\n\n${after}`)
        .filter((doc) => !/\r/.test(doc));
      fc.assert(
        fc.property(withMarker, (doc) => {
          fc.pre(save(doc) === doc);
          const blocks = markdownToBlocks(doc);
          const target = blocks.find((b) => b.type === "p" && b.text === "EDITME here.");
          fc.pre(!!target);
          target.text = "EDITED here.";
          expect(applyEol(blocksToMarkdown(blocks), detectEol(doc))).toBe(
            doc.replace("EDITME here.", "EDITED here."),
          );
        }),
        options,
      );
    },
    timeout,
  );
});

describe("generated inline text", () => {
  it(
    "survives being painted and read back",
    () => {
      fc.assert(
        fc.property(inlineText, (text) => {
          fc.pre(!KNOWN_INLINE.some(([, holds]) => holds(text)));
          const el = document.createElement("p");
          el.innerHTML = inlineMarkdownToHtml(text);
          expect(domNodeToMarkdown(el), "live DOM read-back").toBe(text);
          expect(htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)), "serialised").toBe(text);
        }),
        options,
      );
    },
    timeout,
  );
});
