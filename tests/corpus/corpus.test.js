/**
 * @vitest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
} from "../../src/utils/markdown.js";
import { domNodeToMarkdown, inlineMarkdownToHtml } from "../../src/utils/inlineFormatting.js";
import { isEditableBlock } from "../../src/utils/domHelpers.js";
import { KNOWN_INLINE, explainedRewrite } from "../utils/knownRewrites.js";

// ─────────────────────────────────────────────────────────────────────────────
// A CORPUS OF REAL NOTES, run by hand
//
//   BOOJY_CORPUS=/path/to/a/vault pnpm vitest run tests/corpus
//
// Every `.md` under the folder goes through load → save as the desktop path
// does, read only (nothing is written), and every text block through the road
// a keystroke sends it (rendered, read back from the DOM). A file whose bytes change fails the
// run, unless the change is a rewrite already on record (knownRewrites.js)
// and nothing else, which is counted apart (an inline one: KNOWN_INLINE). Skipped without BOOJY_CORPUS, so CI never needs one.
// Point it at a real vault, a clone of a public one, or the CommonMark spec's
// examples saved one per file; what it finds becomes a minimal fixture in
// tests/fixtures/preservation/.
// ─────────────────────────────────────────────────────────────────────────────

const root = process.env.BOOJY_CORPUS;

const save = (raw) => applyEol(blocksToMarkdown(markdownToBlocks(raw)), detectEol(raw));
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Every note under `dir`, skipping what the vault walk skips. */
function notesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...notesUnder(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** The vault's readable notes, as text. */
function readableNotes(dir) {
  const out = [];
  for (const file of notesUnder(dir)) {
    try {
      out.push([path.relative(dir, file), utf8.decode(fs.readFileSync(file))]);
    } catch {
      // not UTF-8: listed by the app, never written (files rule)
    }
  }
  return out;
}

/** block.text after a keystroke's road: rendered into a block, read back. */
function typedBack(text) {
  const el = document.createElement("p");
  el.innerHTML = inlineMarkdownToHtml(text);
  return domNodeToMarkdown(el);
}

/** The first line the save changed: its number, and the line before and after. */
function firstChange(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return { line: i + 1, was: a[i] ?? "<end>", became: b[i] ?? "<end>" };
}

describe.skipIf(!root)("a corpus of real notes (BOOJY_CORPUS)", () => {
  it("every note survives load → save byte for byte, and a second save changes nothing", () => {
    const files = notesUnder(root);
    const changed = [];
    const known = new Map();
    const unstable = [];
    let unreadable = 0;
    for (const file of files) {
      let raw;
      try {
        raw = utf8.decode(fs.readFileSync(file));
      } catch {
        unreadable++; // listed by the app, never written (files rule)
        continue;
      }
      const once = save(raw);
      if (save(once) !== once) unstable.push(path.relative(root, file));
      if (once === raw) continue;
      const why = explainedRewrite(raw, once);
      if (why) known.set(why, (known.get(why) ?? 0) + 1);
      else changed.push({ file: path.relative(root, file), ...firstChange(raw, once) });
    }
    console.log(
      [
        `${files.length} notes: ${files.length - changed.length - unreadable - [...known.values()].reduce((a, b) => a + b, 0)} unchanged,` +
          ` ${changed.length} changed, ${unreadable} not UTF-8.`,
        ...[...known].map(([why, n]) => `  known, ${n}: ${why}`),
        ...changed
          .slice(0, 50)
          .map(
            (c) => `  ${c.file}:${c.line}  ${JSON.stringify(c.was)} → ${JSON.stringify(c.became)}`,
          ),
      ].join("\n"),
    );
    expect(unstable, "notes a second save changes again").toEqual([]);
    expect(changed, "notes a save changes, beyond the known rewrites").toEqual([]);
  });

  it("every text block survives a keystroke: rendered, then read back from the DOM", () => {
    const changed = [];
    const known = new Map();
    let blocks = 0;
    for (const [file, raw] of readableNotes(root)) {
      for (const block of markdownToBlocks(raw)) {
        if (!isEditableBlock(block) || !block.text) continue;
        blocks++;
        const back = typedBack(block.text);
        if (back === block.text) continue;
        const why = KNOWN_INLINE.find(([, holds]) => holds(block.text))?.[0];
        if (why) known.set(why, (known.get(why) ?? 0) + 1);
        else changed.push(`  ${file}  ${JSON.stringify(block.text)} → ${JSON.stringify(back)}`);
      }
    }
    console.log(
      [
        `${blocks} text blocks: ${changed.length} changed.`,
        ...[...known].map(([why, n]) => `  known, ${n}: ${why}`),
        ...changed.slice(0, 50),
      ].join("\n"),
    );
    expect(changed, "text blocks a keystroke changes, beyond the known rewrites").toEqual([]);
  });
});
