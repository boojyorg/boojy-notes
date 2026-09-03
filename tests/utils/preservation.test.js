import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
} from "../../src/utils/markdown.js";

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN → BLOCKS → MARKDOWN PRESERVATION CORPUS
//
// The other direction from tests/utils/markdown.test.js. That file guards
// block → markdown → block (what Boojy creates survives). THIS file guards the
// preservation promise (docs/SPEC-markdown-source-of-truth.md): a markdown file Boojy did NOT
// create must survive Boojy's load → save cycle byte-for-byte — including
// syntax Boojy doesn't understand — and an edit to one paragraph must change
// only that paragraph's line.
//
// The fixtures in tests/fixtures/preservation/ are deliberately awkward files
// (tilde fences, escaped table pipes, CRLF, trailing spaces, plugin syntax…).
// They simulate the exact desktop save path: electron/noteFileManager.js writes
// blocksToMarkdown(markdownToBlocks(raw)) verbatim, so this loop IS what
// reaches disk.
//
// KNOWN FAILURES are marked with it.fails rather than omitted: the suite stays
// green while the damage is documented, and the moment a fix lands the marked
// test turns red — remove the fixture from KNOWN_FAILURES then. Never delete a
// fixture to make the suite pass. The 2026-08-18 damage report ranks these
// (worst: escaped pipes in tables delete cell content; indented code blocks
// flatten to paragraphs).
//
// Fixtures are byte-sensitive. Editors love to strip trailing spaces, add
// final newlines, and normalise CRLF — regenerate via git checkout rather than
// hand-editing if one is mangled.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "preservation",
);

// Fixture → which experiments currently fail byte-exactness.
// (The inline comments on each entry carry the per-fixture failure detail.)
const KNOWN_FAILURES = {
  "backtick-fences.md": { roundtrip: true, edit: true }, // empty fence gains a blank line
  "blockquotes-callouts.md": { roundtrip: true, edit: true }, // ">" → "> "; callout type lowercased
  // Two patterns found by the 2026-08-18 real-vault smoke test (209 files):
  "indented-fences.md": { roundtrip: true, edit: true }, // fence's own leading spaces dropped (serialised at col 0)
  "trailing-ws-list-lines.md": { roundtrip: true, edit: true }, // list/heading lines still trim trailing spaces (paragraphs don't)
  "table-alignment.md": { roundtrip: true, edit: true }, // padding/:--- rewritten; ragged rows padded (escaped-\| DATA LOSS fixed 2026-08 — see table-escaped-pipes.md)
};

const fixtureNames = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

/**
 * load → save with no edit, exactly as the desktop path does:
 * parseNoteFile detects the EOL style and parses; write-note serialises and
 * re-applies the style via applyEol (electron/noteFileManager.js).
 */
function roundTrip(raw) {
  return applyEol(blocksToMarkdown(markdownToBlocks(raw)), detectEol(raw));
}

/** load → rewrite the EDITME paragraph → save. Returns [actual, expected]. */
function editElsewhere(raw) {
  const blocks = markdownToBlocks(raw);
  const target = blocks.find((b) => b.type === "p" && b.text.includes("EDITME"));
  target.text = target.text.replace("EDITME", "EDITED");
  return [applyEol(blocksToMarkdown(blocks), detectEol(raw)), raw.replace("EDITME", "EDITED")];
}

describe("preservation corpus: load → save is byte-identical", () => {
  for (const name of fixtureNames) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
    const test = KNOWN_FAILURES[name]?.roundtrip ? it.fails : it;
    test(name, () => {
      expect(roundTrip(raw)).toBe(raw);
    });
  }
});

describe("preservation corpus: editing one paragraph changes only that line", () => {
  for (const name of fixtureNames) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
    const test = KNOWN_FAILURES[name]?.edit ? it.fails : it;
    test(name, () => {
      // Every fixture must keep its EDITME line parseable as a plain paragraph —
      // if this throws, the parser destroyed the edit target itself.
      const [actual, expected] = editElsewhere(raw);
      expect(actual).toBe(expected);
    });
  }
});

describe("preservation corpus: fixture invariants", () => {
  it("every fixture has exactly one EDITME paragraph target", () => {
    for (const name of fixtureNames) {
      const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
      expect(raw.split("EDITME").length, `${name} must contain exactly one EDITME`).toBe(2);
      const target = markdownToBlocks(raw).find(
        (b) => b.type === "p" && (b.text || "").includes("EDITME"),
      );
      expect(target, `${name}: EDITME must survive parsing as a plain paragraph`).toBeTruthy();
    }
  });
});
