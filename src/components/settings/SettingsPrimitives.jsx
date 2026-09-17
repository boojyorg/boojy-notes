import { useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Tooltip, useTooltip } from "../Tooltip";
import { FolderIcon } from "../Icons";
import { isElectronMac } from "../../utils/platform";

/**
 * The parts Settings and first-run setup are built from (2026-09-17), so the
 * two read as one surface: the palette's ground with a hairline and a 12px
 * radius, section titles in the `Notes` row's grammar, bordered buttons in
 * the confirm dialog's, and the folder path as a control of its own.
 */

/** The dialog surface: the search palette's, not a second modal style. */
export const dialogSurface = (theme) => ({
  background: theme.BG.elevated,
  border: `1px solid ${theme.BG.divider}`,
  borderRadius: 12,
  boxShadow: theme.modalShadow,
});

/** The scrim under a dialog: the palette's 30% black, no blur. */
export const SCRIM = "rgba(0,0,0,0.3)";

/** A section's title: 14px medium in muted ink, a label not a heading. */
export function SectionTitle({ title }) {
  const { theme } = useTheme();
  return (
    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: "20px", color: theme.TEXT.muted }}>
      {title}
    </div>
  );
}

/** The rule between sections: 1px of the divider with 20px either side. */
export function SettingsRule() {
  const { theme } = useTheme();
  return (
    <div role="separator" style={{ height: 1, background: theme.BG.divider, margin: "20px 0" }} />
  );
}

/**
 * A 30px bordered button. `kind`: "normal" (enabled, primary ink on the
 * theme's button surface), "disabled" (`aria-disabled`, muted, no surface, so
 * an enabled button is told from it before hover), "accent" (the mark with
 * the dark label ink, for the one action that needs a decision).
 * Hover and focus are CSS (`settingsStyles`).
 */
export function SmallButton({
  kind = "normal",
  icon = null,
  children,
  style = undefined,
  ...rest
}) {
  const { theme } = useTheme();
  const { TEXT, ACCENT } = theme;
  const disabled = kind === "disabled";
  const accent = kind === "accent";
  return (
    <button
      type="button"
      className={`settings-button${accent ? " is-accent" : ""}`}
      aria-disabled={disabled || undefined}
      {...rest}
      onClick={disabled ? undefined : rest.onClick}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 8,
        border: accent ? "none" : `1px solid ${disabled ? theme.BG.divider : theme.button.border}`,
        background: accent ? ACCENT.primary : disabled ? "transparent" : theme.button.bg,
        color: accent ? ACCENT.onAccentText : disabled ? TEXT.muted : TEXT.primary,
        fontSize: 13,
        fontWeight: accent ? 600 : 500,
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/** `~` for the home directory, on either platform. */
export const displayPath = (dir) =>
  dir ? dir.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/, "~") : "\u2014";

/** The path with a break opportunity after each separator, so a long one wraps at its folders. */
function BreakablePath({ path }) {
  const parts = path.split("/");
  return parts.map((part, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the segments are positional
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ));
}

export const SHOW_IN_FOLDER_LABEL = isElectronMac ? "Show in Finder" : "Show in folder";

/**
 * The folder glyph and the path as one control that reveals the folder. No
 * surface: it reads as information until the pointer reaches it, when the
 * ink lifts a step and the app's chip names it after the usual rest; keyboard
 * focus draws the inset accent ring (`settingsStyles`). Without `onReveal`
 * (a folder that does not exist yet, the web build) it is the same text and
 * does nothing.
 */
export function FolderPathControl({ path, onReveal }) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const tip = useTooltip();
  const ref = useRef(null);
  const shown = displayPath(path);
  const inner = (
    <>
      <span
        className="settings-path-glyph"
        style={{ display: "inline-flex", marginTop: 3, color: TEXT.muted }}
      >
        <FolderIcon />
      </span>
      <span style={{ fontSize: 14, lineHeight: "22px", overflowWrap: "anywhere", minWidth: 0 }}>
        <BreakablePath path={shown} />
      </span>
    </>
  );
  const layout = {
    display: "inline-flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "4px 8px",
    margin: "0 0 0 -8px",
    borderRadius: 8,
    textAlign: "left",
    minWidth: 0,
    flex: "1 1 auto",
    color: TEXT.secondary,
  };
  if (!onReveal) {
    return (
      <div data-testid="notes-folder-path" style={layout}>
        {inner}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", display: "flex", minWidth: 0, flex: "1 1 auto" }}>
      <button
        ref={ref}
        type="button"
        className="settings-path-control"
        data-testid="notes-folder-path"
        aria-label={SHOW_IN_FOLDER_LABEL}
        onClick={onReveal}
        onMouseEnter={tip.handlers.onMouseEnter}
        onMouseLeave={tip.handlers.onMouseLeave}
        onMouseDown={tip.handlers.onMouseDown}
        onMouseUp={tip.handlers.onMouseUp}
        onFocus={tip.handlers.onFocus}
        onBlur={tip.handlers.onBlur}
        onKeyDown={tip.handlers.onKeyDown}
        style={{
          ...layout,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {inner}
      </button>
      {tip.shown && (
        <Tooltip
          label={SHOW_IN_FOLDER_LABEL}
          anchor={ref.current}
          placement="below"
          testId="path-tooltip"
        />
      )}
    </div>
  );
}

/**
 * The hover and focus rules for the parts above, in GlobalStyles. Hover
 * lifts ink; the path never takes a surface; focus is the app's inset ring.
 */
export const settingsStyles = (theme) => `
  .settings-path-control:hover { color: ${theme.TEXT.primary} !important; }
  .settings-path-control:hover .settings-path-glyph { color: ${theme.TEXT.secondary} !important; }
  .settings-path-control:focus-visible { outline: none; box-shadow: inset 0 0 0 2px ${theme.ACCENT.primary}; }
  .settings-button:not([aria-disabled="true"]):not(.is-accent):hover { background: ${theme.BG.surface} !important; }
  .settings-button.is-accent:hover { filter: brightness(0.96); }
  .settings-button:focus-visible { outline: none; box-shadow: 0 0 0 2px ${theme.ACCENT.primary}; }
  .theme-pill:not([aria-checked="true"]):hover { background: ${theme.BG.surface} !important; color: ${theme.TEXT.primary} !important; }
  .theme-pill:focus-visible { outline: none; box-shadow: inset 0 0 0 2px ${theme.ACCENT.primary}; }
`;
