import { describe, it, expect } from "vitest";
import { NIGHT, DAY } from "../../src/constants/themes.js";
import { REMOVE_X_ALPHA, TAG_PILL_ALPHA, TAG_PILL_HOVER_ALPHA } from "../../src/styles/tagPill";

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

/** `top` at `alpha` laid over the opaque `under`, as a hex colour. */
function over(top, alpha, under) {
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(ch(top, i) * alpha + ch(under, i) * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
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

    // The Markdown view's inks, on the sheet and, in a `markdown` code block,
    // on the code block's ground.
    for (const [name, ink] of Object.entries({
      "TEXT.primary": theme.TEXT.primary,
      "TEXT.secondary": theme.TEXT.secondary,
      "TEXT.muted": theme.TEXT.muted,
      "ACCENT.text": theme.ACCENT.text,
      "sourceView.list": theme.sourceView.list,
    })) {
      for (const [ground, bg] of [
        ["BG.editor", theme.BG.editor],
        ["codeBlockBg", theme.codeBlockBg],
      ]) {
        it(`Markdown's ${name} reads on ${ground}`, () => {
          expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    // A callout's ground is its ink at calloutGround over the sheet: the title
    // and icon in that ink, the body in the note's own, both read on it.
    for (const [type, { colour }] of Object.entries(theme.callouts)) {
      const ground = over(colour, theme.calloutGround, theme.BG.editor);
      it(`a ${type} callout's title reads on its ground`, () => {
        expect(contrast(colour, ground)).toBeGreaterThanOrEqual(4.5);
      });
      it(`a ${type} callout's body reads on its ground`, () => {
        expect(contrast(theme.TEXT.primary, ground)).toBeGreaterThanOrEqual(4.5);
      });
    }

    // Code is read on the code block's ground and, in the Markdown view, on the sheet.
    for (const [token, ink] of Object.entries(theme.syntax)) {
      for (const [ground, bg] of [
        ["BG.editor", theme.BG.editor],
        ["codeBlockBg", theme.codeBlockBg],
      ]) {
        it(`syntax.${token} reads on ${ground}`, () => {
          expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    // The pill: on the sheet in a note, hovered there too; the Search chip, on
    // the palette, never takes the hover ground.
    it("a tag pill's words read on its grounds", () => {
      const key = theme.name === "night" ? "night" : "day";
      const pills = [
        over(theme.ACCENT.primary, TAG_PILL_ALPHA[key], theme.BG.editor),
        over(theme.ACCENT.primary, TAG_PILL_HOVER_ALPHA[key], theme.BG.editor),
        over(theme.ACCENT.primary, TAG_PILL_ALPHA[key], theme.BG.elevated),
      ];
      for (const pill of pills)
        expect(contrast(theme.ACCENT.tagText, pill)).toBeGreaterThanOrEqual(4.5);
    });

    it("a property item's × shows beside it, and a tag's on its pill", () => {
      const key = theme.name === "night" ? "night" : "day";
      for (const ground of ["editor", "surface", "hover"]) {
        const g = theme.BG[ground];
        expect(contrast(over(theme.TEXT.muted, REMOVE_X_ALPHA.item, g), g)).toBeGreaterThanOrEqual(
          3,
        );
      }
      for (const alpha of [TAG_PILL_ALPHA[key], TAG_PILL_HOVER_ALPHA[key]]) {
        const pill = over(theme.ACCENT.primary, alpha, theme.BG.editor);
        expect(
          contrast(over(theme.ACCENT.tagText, REMOVE_X_ALPHA.tag, pill), pill),
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it("a destructive label reads on a button", () => {
      // Light's button is transparent: it sits on the dialog's elevated ground.
      const button = theme.button.bg === "transparent" ? theme.BG.elevated : theme.button.bg;
      expect(contrast(theme.SEMANTIC.error, button)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
