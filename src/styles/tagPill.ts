import { withAlpha } from "../utils/selectionBand";
import type { Theme } from "../hooks/useTheme";

/**
 * The tag pill: `#tag` in the editor and the filter chip in Search are one
 * shape. The ground is the accent at a low alpha, a step stronger than the
 * selection band (a neutral grey reads too faint), with the accent as ink; the Markdown stays plain `#tag`, the
 * pill is CSS on the span the renderer already draws. Inline padding never
 * grows the line box.
 */
/**
 * Half a pixel more below than above: the text box keeps room for descenders that `#`,
 * capitals and most lowercase never use, so evenly padded, the letters sat 0.5px low.
 */
export const TAG_PILL_PADDING = "1.5px 8px 2.5px";
/** The same lift inside a pill whose box is fixed and centred (a tag in Properties). */
export const TAG_PILL_TEXT_LIFT = 0.5;
export const TAG_PILL_RADIUS = 999;
export const TAG_PILL_FONT = "0.92em";
/** Ground alpha by theme name (`day` / `night`), rest and hover. */
export const TAG_PILL_ALPHA = { day: 0.3, night: 0.22 } as const;
export const TAG_PILL_HOVER_ALPHA = { day: 0.4, night: 0.32 } as const;
/** Being edited (the caret in it): a fainter ground, text for now, not a button. */
export const TAG_PILL_EDIT_ALPHA = { day: 0.12, night: 0.1 } as const;

/**
 * The × that removes a list item or a tag, as a share of its ink (muted beside a list item,
 * the tag's own on a pill): the lightest each can be and still show at 3:1 on its lowest
 * ground (a hovered row; the hovered pill). `themeContrast.test.js`.
 */
export const REMOVE_X_ALPHA = { item: 0.8, tag: 0.75 } as const;

const key = (theme: Theme) => (theme.name === "night" ? "night" : "day");

export function tagPillGround(theme: Theme, hover = false): string {
  const alpha = (hover ? TAG_PILL_HOVER_ALPHA : TAG_PILL_ALPHA)[key(theme)];
  return withAlpha(theme.ACCENT.primary, alpha);
}

export function tagPillStyle(theme: Theme) {
  return {
    background: tagPillGround(theme),
    color: theme.ACCENT.tagText,
    padding: TAG_PILL_PADDING,
    borderRadius: TAG_PILL_RADIUS,
    fontSize: TAG_PILL_FONT,
  } as const;
}

/** The editor's rule for the same pill. */
export function tagPillCss(theme: Theme) {
  return `
        [data-block-id] .inline-tag {
          background: ${tagPillGround(theme)};
          color: ${theme.ACCENT.tagText};
          padding: ${TAG_PILL_PADDING};
          border-radius: ${TAG_PILL_RADIUS}px;
          font-size: ${TAG_PILL_FONT};
          cursor: pointer;
        }
        [data-block-id] .inline-tag:hover {
          background: ${tagPillGround(theme, true)};
        }
        /* Being edited (the caret is in it): text for now, so a fainter ground. */
        [data-block-id] .inline-tag[data-editing],
        [data-block-id] .inline-tag[data-editing]:hover {
          background: ${withAlpha(theme.ACCENT.primary, TAG_PILL_EDIT_ALPHA[key(theme)])};
          cursor: text;
        }`;
}
