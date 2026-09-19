import { useCallback, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { SCALE_DEFAULT, parseScale } from "../../utils/uiScale";
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "../Icons";
import { SmallButton } from "./SettingsPrimitives";
import ScaleMenu from "./ScaleMenu";

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

/**
 * Settings → Appearance → Interface size: how big the app draws everything,
 * the `Cmd+±` scale given a control (2026-09-19). It was keyboard-only, so
 * nothing in the app said the feature existed, nothing said what scale you
 * were on, and nothing said `Cmd+0` was the way back.
 *
 * **It is a menu, not a stepper** (judged live, Tyr): the scale redraws the
 * whole app, Settings included, so a control pressed repeatedly moved out from
 * under the pointer between presses. A menu is one press to open and one to
 * choose, and the app resizes once, after the choice. `Custom…` takes a whole
 * percentage inside the same range; it is applied on Enter or Apply and never
 * while it is being typed, because the field would resize under the caret.
 * Escape leaves the value as it was. `Reset` shows only off the default.
 */
function InterfaceSize() {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const { uiScale, setUiScale } = useSettings();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [custom, setCustom] = useState(null);

  const openMenu = (e) => setMenuAnchor(e.currentTarget.getBoundingClientRect());
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  // The field opens on the scale in use, so a nudge from 120 to 125 is two
  // keystrokes rather than a fresh number.
  const startCustom = useCallback(() => setCustom(String(uiScale)), [uiScale]);
  const commitCustom = () => {
    const next = parseScale(custom);
    if (next !== null) setUiScale(next);
    setCustom(null);
  };

  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 30 }}
    >
      <div id="interface-size-label" style={{ fontSize: 14, color: TEXT.primary }}>
        Interface size
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {custom === null ? (
          <>
            {uiScale !== SCALE_DEFAULT && (
              <SmallButton onClick={() => setUiScale(SCALE_DEFAULT)}>Reset</SmallButton>
            )}
            <SmallButton
              aria-haspopup="menu"
              aria-expanded={!!menuAnchor}
              aria-labelledby="interface-size-label"
              data-testid="ui-scale-value"
              onClick={openMenu}
              style={{ gap: 6, minWidth: 86, justifyContent: "space-between" }}
            >
              {`${uiScale}%`}
              <ChevronDownIcon size={14} />
            </SmallButton>
          </>
        ) : (
          <>
            <input
              // Opened on purpose, from the menu's own Custom… row.
              autoFocus
              inputMode="numeric"
              aria-label="Interface size, per cent"
              data-testid="ui-scale-input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                } else if (e.key === "Escape") {
                  // The dialog's own Escape would close Settings behind this.
                  e.preventDefault();
                  setCustom(null);
                }
              }}
              style={{
                width: 64,
                height: 30,
                boxSizing: "border-box",
                padding: "0 8px",
                borderRadius: 8,
                border: `1px solid ${theme.button.border}`,
                background: BG.elevated,
                color: TEXT.primary,
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 14, color: TEXT.muted, marginLeft: -2 }}>%</span>
            <SmallButton onClick={commitCustom}>Apply</SmallButton>
          </>
        )}
      </div>
      {menuAnchor && (
        <ScaleMenu
          anchor={menuAnchor}
          scale={uiScale}
          onChoose={setUiScale}
          onCustom={startCustom}
          onClose={closeMenu}
        />
      )}
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
