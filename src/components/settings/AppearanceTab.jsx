import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { SCALE_DEFAULT, parseScale, stepScale } from "../../utils/uiScale";
import { SCALE_MAX, SCALE_MIN } from "../../utils/uiScale";
import { MinusIcon, MonitorIcon, MoonIcon, PlusIcon, SunIcon } from "../Icons";

/** Stored keys stay "day"/"night"/"auto" so every saved preference keeps
 *  working; the product words are Light / Dark / System. */
const MODES = [
  ["day", "Light", SunIcon],
  ["night", "Dark", MoonIcon],
  ["auto", "System", MonitorIcon],
];

/**
 * The appearance choice as three pills, shared by Settings and setup: a
 * Lucide glyph and the word, the chosen one on the row-hover ground in
 * primary ink and nothing in the accent (accent is never a desktop surface).
 * A radiogroup, so the arrows move between them as a picker's do.
 */
export function ThemePills() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: -12 }}
    >
      {MODES.map(([mode, label, Icon]) => {
        const selected = themeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            className="theme-pill"
            onClick={() => setThemeMode(mode)}
            style={{
              height: 32,
              padding: "0 14px 0 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "none",
              borderRadius: 12,
              background: selected ? BG.hover : "transparent",
              color: selected ? TEXT.primary : TEXT.secondary,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One segment of the stepper: flat inside the pill, the hairline its divider. */
function Segment({ divider, disabled, children, style, ...rest }) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      {...rest}
      onClick={disabled ? undefined : rest.onClick}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = theme.BG.surface;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      style={{
        height: "100%",
        padding: "0 9px",
        border: "none",
        borderLeft: divider ? `1px solid ${theme.button.border}` : "none",
        background: "transparent",
        color: disabled ? TEXT.muted : TEXT.primary,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s, color 0.12s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Settings → Appearance → Interface size: how big the app draws everything,
 * the `Cmd+±` scale given a control (2026-09-19). It was keyboard-only, so
 * nothing in the app said the feature existed, nothing said what scale you
 * were on, and nothing said `Cmd+0` was the way back.
 *
 * **One segmented control** — `−`, the figure and `+` in a single pill — and
 * **every press applies at once**. It is the pane that holds still, not the
 * scale: Settings keeps the size it opened with (`SettingsModal`), so the app
 * behind it resizes under each press while the button stays under the pointer.
 * A debounce was tried first and judged twice: the controls still moved once
 * per run, and the timer brought a pending value that could land on top of a
 * newer one. There is no timer here.
 *
 * **The figure is a control**: clicking it types a whole percentage in the same
 * range, applied on Enter or on leaving the field and never while it is typed
 * (the field would resize under the caret). Escape cancels, and so does a scale
 * that arrives from anywhere else — a shortcut or Reset — so an unfinished edit
 * can never overwrite something newer. `Reset` shows only off the default (at
 * 100% there is nothing to go back to), with no surface of its own, and sits to
 * the left so `−` and `+` never move when it appears.
 */
function InterfaceSize() {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const { uiScale, setUiScale } = useSettings();
  const [typing, setTyping] = useState(null);
  // The scale the row itself last asked for, so one that arrives from anywhere
  // else can be told apart — and take an unfinished edit with it.
  const askedRef = useRef(uiScale);
  // Escape unmounts the field, and the blur that follows must not commit it.
  const cancelledRef = useRef(false);

  const apply = useCallback(
    (next) => {
      askedRef.current = next;
      setUiScale(next);
    },
    [setUiScale],
  );

  useEffect(() => {
    if (uiScale === askedRef.current) return;
    askedRef.current = uiScale;
    setTyping(null);
  }, [uiScale]);

  const commitTyped = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = parseScale(typing);
    setTyping(null);
    if (next !== null && next !== uiScale) apply(next);
  };

  const bump = (direction) => {
    const next = stepScale(uiScale, direction);
    if (next !== uiScale) apply(next);
  };

  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 30 }}
    >
      <div id="interface-size-label" style={{ fontSize: 14, color: TEXT.primary }}>
        Interface size
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* No surface, as the notes folder path: information until the pointer
            reaches it (`settingsStyles`). Only off the default. */}
        {uiScale !== SCALE_DEFAULT && (
          <button
            type="button"
            className="settings-reset"
            onMouseDown={(e) => {
              // Before the field's blur, so a half-typed value cannot land
              // after the reset it was abandoned for.
              e.preventDefault();
              cancelledRef.current = true;
            }}
            onClick={() => {
              setTyping(null);
              apply(SCALE_DEFAULT);
            }}
            style={{
              border: "none",
              background: "transparent",
              padding: "4px 2px",
              color: TEXT.secondary,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "color 0.12s",
            }}
          >
            Reset
          </button>
        )}
        <div
          role="group"
          aria-labelledby="interface-size-label"
          style={{
            display: "inline-flex",
            alignItems: "stretch",
            height: 30,
            borderRadius: 8,
            border: `1px solid ${theme.button.border}`,
            background: theme.button.bg,
            overflow: "hidden",
          }}
        >
          <Segment aria-label="Smaller" disabled={uiScale <= SCALE_MIN} onClick={() => bump(-1)}>
            <MinusIcon size={14} />
          </Segment>
          {typing === null ? (
            <Segment
              divider
              aria-label="Set a custom size"
              data-testid="ui-scale-value"
              onClick={() => setTyping(String(uiScale))}
              style={{ minWidth: 62, fontVariantNumeric: "tabular-nums" }}
            >
              {`${uiScale}%`}
            </Segment>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 62,
                borderLeft: `1px solid ${theme.button.border}`,
                color: TEXT.primary,
                fontSize: 13,
              }}
            >
              <input
                // Opened on purpose, by a click on the figure itself.
                autoFocus
                inputMode="numeric"
                aria-label="Interface size, per cent"
                data-testid="ui-scale-input"
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={commitTyped}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTyped();
                  } else if (e.key === "Escape") {
                    // The dialog's own Escape would close Settings behind this,
                    // and the blur that follows must not commit what was typed.
                    e.preventDefault();
                    cancelledRef.current = true;
                    setTyping(null);
                  }
                }}
                style={{
                  width: 34,
                  border: "none",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  textAlign: "right",
                  outline: "none",
                  padding: 0,
                }}
              />
              <span style={{ color: TEXT.muted }}>%</span>
            </div>
          )}
          <Segment
            divider
            aria-label="Larger"
            disabled={uiScale >= SCALE_MAX}
            onClick={() => bump(1)}
          >
            <PlusIcon size={14} />
          </Segment>
        </div>
      </div>
    </div>
  );
}

export default function AppearanceTab({ SectionHeader }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHeader title="Appearance" />
      <ThemePills />
      <InterfaceSize />
    </div>
  );
}
