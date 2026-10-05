import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
} from "../../src/utils/markdown.js";
import { knownRewrite } from "../utils/knownRewrites.js";

// ─────────────────────────────────────────────────────────────────────────────
// A CORPUS OF REAL NOTES, run by hand
//
//   BOOJY_CORPUS=/path/to/a/vault pnpm vitest run tests/corpus
//
// Every `.md` under the folder goes through load → save as the desktop path
// does, read only (nothing is written). A file whose bytes change fails the
// run, unless the change is a rewrite already on record (knownRewrites.js),
// which is counted apart. Skipped without BOOJY_CORPUS, so CI never needs one.
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
      const why = knownRewrite(raw);
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
});
