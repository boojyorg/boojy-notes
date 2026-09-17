import { useTheme } from "../../hooks/useTheme";
import { MonitorIcon, MoonIcon, SunIcon } from "../Icons";

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

export default function AppearanceTab({ SectionHeader }) {
  // Appearance is the theme picker alone. UI scale stays a keyboard feature
  // (Cmd+Plus / Cmd+Minus / Cmd+0 in useAppKeyboard).
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHeader title="Appearance" />
      <ThemePills />
    </div>
  );
}
