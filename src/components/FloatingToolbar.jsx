import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { FormatIcon } from "./Icons";
import { isMac } from "../utils/platform";

/** How long the pointer rests on a button before its name and shortcut show. */
export const TOOLTIP_REST_MS = 400;
/** Button box. The 32px control tier read chunky hovering over a line of text (judged 2026-09-10). */
const BTN = 28;
/** Space the tooltip needs above the toolbar; nearer the column's top it flips below. */
const TOOLTIP_CLEARANCE = 32;
const HINT_FONT = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

/**
 * The strip's order, names and shortcuts. The shortcuts are the map in
 * useKeyboardHandlers; the two must agree, and this is the one place a
 * shortcut is shown to the user.
 */
export const FORMATS = [
  { id: "bold", label: "Bold", key: "B" },
  { id: "italic", label: "Italic", key: "I" },
  { id: "strikethrough", label: "Strikethrough", key: "S", shift: true },
  { id: "highlight", label: "Highlight", key: "H", shift: true },
  { id: "code", label: "Inline code", key: "`" },
  { id: "link", label: "Link", key: "K" },
];

/** `⇧⌘S` on a Mac, `Ctrl+Shift+S` elsewhere: each platform's own modifier order. */
export function shortcutLabel({ key, shift }, mac = isMac) {
  if (mac) return `${shift ? "⇧" : ""}⌘${key}`;
  return `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

function Tooltip({ label, shortcut, below }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <div
      role="tooltip"
      aria-hidden="true"
      data-testid="format-tooltip"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        ...(below ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }),
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "3px 8px",
        borderRadius: 4,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        color: TEXT.primary,
        fontSize: 11,
        lineHeight: "16px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      <span>{label}</span>
      <span style={{ color: TEXT.muted, fontFamily: HINT_FONT }}>{shortcut}</span>
    </div>
  );
}

function ToolbarBtn({ format, active, onClick, onRest, onLeave, tip, tipBelow }) {
  const { theme } = useTheme();
  const { ACCENT, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      aria-pressed={active}
      aria-label={format.label}
      data-testid={`format-${format.id}`}
      onMouseDown={(e) => {
        // The default would move focus and collapse the selection being formatted.
        e.preventDefault();
        onClick();
      }}
      onMouseEnter={() => {
        setHovered(true);
        onRest(format.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onLeave();
      }}
      style={{
        position: "relative",
        width: BTN,
        height: BTN,
        borderRadius: 5,
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Active is the glyph in the accent and nothing else, Notion's grammar:
        // the fill is for hover alone, so a pressed button still lifts on hover
        // and the accent stays ink, never a surface (judged 2026-09-10).
        background: hovered ? theme.overlay(0.08) : "transparent",
        color: active ? ACCENT.primary : TEXT.primary,
        transition: "background 0.1s, color 0.1s",
      }}
    >
      <FormatIcon name={format.id} />
      {tip && <Tooltip label={format.label} shortcut={shortcutLabel(format)} below={tipBelow} />}
    </button>
  );
}

/**
 * The selection toolbar: six Lucide glyphs in one pill, shown over a finished
 * selection (useEditorFocusUX decides when) and kept there while a format is
 * applied, its pressed state refreshed. Resting on a button for
 * TOOLTIP_REST_MS shows its name and shortcut above it, or below when the
 * toolbar sits too near the top of the column for the chip to fit.
 */
const FloatingToolbar = memo(function FloatingToolbar({ position, activeFormats, onFormat }) {
  const { theme } = useTheme();
  const { BG } = theme;
  const [tip, setTip] = useState(null);
  // The pending rest, as an object so a late timer can check it is still current.
  const pending = useRef(null);
  const cancelRest = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);
  const onRest = (id) => {
    cancelRest();
    const rest = { id, timer: null };
    rest.timer = setTimeout(() => {
      if (pending.current !== rest) return;
      setTip(id);
    }, TOOLTIP_REST_MS);
    pending.current = rest;
  };
  const onLeave = () => {
    cancelRest();
    setTip(null);
  };
  useEffect(() => cancelRest, [cancelRest]);
  // A hidden toolbar shows no tip when it comes back.
  useEffect(() => {
    if (!position) {
      cancelRest();
      setTip(null);
    }
  }, [position, cancelRest]);

  if (!position) return null;
  const tipBelow = position.top < TOOLTIP_CLEARANCE;
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        display: "flex",
        gap: 2,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: "4px 4px",
        boxShadow: theme.modalShadow,
        zIndex: Z.TOOLBAR,
        animation: "fadeInToolbar 0.12s ease-out",
      }}
    >
      {FORMATS.map((format) => (
        <ToolbarBtn
          key={format.id}
          format={format}
          active={activeFormats[format.id]}
          onClick={() => onFormat(format.id)}
          onRest={onRest}
          onLeave={onLeave}
          tip={tip === format.id}
          tipBelow={tipBelow}
        />
      ))}
    </div>
  );
});

export default FloatingToolbar;
