import { describe, it, expect } from "vitest";
import { NIGHT, DAY } from "../../src/constants/themes.js";

// WCAG 2 contrast: 4.5:1 for words, 3:1 for a glyph that carries meaning
// (the toast's icon). Every ink is checked on every ground it can sit on,
// hover included, because hover is also the selected row (by rule).

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUNDS = ["editor", "standard", "elevated", "surface", "hover"];

for (const theme of [NIGHT, DAY]) {
  describe(`${theme.name} contrast`, () => {
    const words = {
      "TEXT.primary": theme.TEXT.primary,
      "TEXT.secondary": theme.TEXT.secondary,
      "TEXT.muted": theme.TEXT.muted,
      "ACCENT.text": theme.ACCENT.text,
      "SEMANTIC.error": theme.SEMANTIC.error,
      link: theme.link.color,
      wikilink: theme.wikilink.color,
    };
    const glyphs = { "SEMANTIC.warning": theme.SEMANTIC.warning };

    for (const ground of GROUNDS) {
      const bg = theme.BG[ground];
      for (const [name, ink] of Object.entries(words)) {
        it(`${name} reads on BG.${ground}`, () => {
          expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const [name, ink] of Object.entries(glyphs)) {
        it(`${name} shows on BG.${ground}`, () => {
          expect(contrast(ink, bg)).toBeGreaterThanOrEqual(3);
        });
      }
    }

    it("a label on the mark reads", () => {
      expect(contrast(theme.ACCENT.onAccentText, theme.ACCENT.primary)).toBeGreaterThanOrEqual(4.5);
    });

    it("a label on the danger button reads", () => {
      expect(contrast(theme.SEMANTIC.onError, theme.SEMANTIC.error)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
