import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { SCALE_OPTIONS } from "../../constants/data";
import { MinusIcon, MonitorIcon, MoonIcon, PlusIcon, SunIcon } from "../Icons";
import { SmallButton } from "./SettingsPrimitives";

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

/** The scale one step either way, or the one it is already on at the ends. */
export function stepScale(scale, direction) {
  const next =
    direction > 0
      ? SCALE_OPTIONS.find((s) => s > scale)
      : [...SCALE_OPTIONS].reverse().find((s) => s < scale);
  return next ?? scale;
}

/**
 * Settings → Appearance → Interface size: how big everything is drawn, the
 * `Cmd+±` scale given a control (2026-09-19). It was keyboard-only, which
 * meant nothing in the app said the feature existed, nothing said what scale
 * you were on, and nothing said `Cmd+0` was the way back.
 *
 * The Updates switch's row: the label at 14px in the primary ink, the control
 * at the right. Two bordered buttons with the figure between them, in a fixed
 * column so the row does not shift as the figure changes width. `Reset` appears
 * only off 100%, because at 100% there is nothing to reset to, and it appears
 * to the *left* of the stepper so that the buttons being pressed repeatedly
 * never move out from under the pointer. A button at the end of the range is
 * `aria-disabled`, the chrome row's grammar: it keeps the pointer and focus and
 * answers nothing.
 */
function InterfaceSize() {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const { uiScale, setUiScale } = useSettings();
  const atMin = uiScale <= SCALE_OPTIONS[0];
  const atMax = uiScale >= SCALE_OPTIONS[SCALE_OPTIONS.length - 1];
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 30 }}
    >
      <div id="interface-size-label" style={{ fontSize: 14, color: TEXT.primary }}>
        Interface size
      </div>
      <div
        role="group"
        aria-labelledby="interface-size-label"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        {uiScale !== 100 && (
          <SmallButton onClick={() => setUiScale(100)} style={{ marginRight: 4 }}>
            Reset
          </SmallButton>
        )}
        <SmallButton
          kind={atMin ? "disabled" : "normal"}
          aria-label="Smaller"
          onClick={() => setUiScale(stepScale(uiScale, -1))}
          style={{ padding: "0 8px" }}
        >
          <MinusIcon />
        </SmallButton>
        <span
          aria-live="polite"
          data-testid="ui-scale-value"
          style={{
            fontSize: 14,
            color: TEXT.primary,
            minWidth: 44,
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {uiScale}%
        </span>
        <SmallButton
          kind={atMax ? "disabled" : "normal"}
          aria-label="Larger"
          onClick={() => setUiScale(stepScale(uiScale, 1))}
          style={{ padding: "0 8px" }}
        >
          <PlusIcon />
        </SmallButton>
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
