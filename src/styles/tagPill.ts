import { withAlpha } from "../utils/selectionBand";
import type { Theme } from "../hooks/useTheme";

/**
 * The tag pill: `#tag` in the editor and the filter chip in Search are one
 * shape. The ground is the accent at a low alpha, a step stronger than the
 * selection band (a neutral grey reads too faint), with the accent as ink; the Markdown stays plain `#tag`, the
 * pill is CSS on the span the renderer already draws. Inline padding never
 * grows the line box.
 */
export const TAG_PILL_PADDING = "2px 8px";
export const TAG_PILL_RADIUS = 999;
export const TAG_PILL_FONT = "0.92em";
/** Ground alpha by theme name (`day` / `night`), rest and hover. */
export const TAG_PILL_ALPHA = { day: 0.3, night: 0.22 } as const;
export const TAG_PILL_HOVER_ALPHA = { day: 0.4, night: 0.32 } as const;

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
        }`;
}
