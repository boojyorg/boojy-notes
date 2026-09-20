/**
 * The tag pill: `#tag` in the editor and the filter chip in Search are one
 * shape. A neutral ground (`BG.surface`, the content-hover tint) with the
 * accent as ink (`ACCENT.text`), never an accent surface (theme rule); the
 * Markdown stays plain `#tag`, the pill is CSS on the span the renderer
 * already draws. Inline padding never grows the line box.
 */
export const TAG_PILL_PADDING = "1px 5px";
export const TAG_PILL_RADIUS = 6;
export const TAG_PILL_FONT = "0.92em";

interface Theme {
  BG: Record<string, string>;
  ACCENT: Record<string, string>;
}

export function tagPillStyle(theme: Theme) {
  return {
    background: theme.BG.surface,
    color: theme.ACCENT.text,
    padding: TAG_PILL_PADDING,
    borderRadius: TAG_PILL_RADIUS,
    fontSize: TAG_PILL_FONT,
  } as const;
}

/** The editor's rule for the same pill. */
export function tagPillCss(theme: Theme) {
  return `
        [data-block-id] .inline-tag {
          background: ${theme.BG.surface};
          color: ${theme.ACCENT.text};
          padding: ${TAG_PILL_PADDING};
          border-radius: ${TAG_PILL_RADIUS}px;
          font-size: ${TAG_PILL_FONT};
          cursor: pointer;
        }
        [data-block-id] .inline-tag:hover {
          background: ${theme.BG.hover};
        }`;
}
