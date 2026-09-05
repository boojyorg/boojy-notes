import { useTheme } from "../../hooks/useTheme";
import { useLayout } from "../../context/LayoutContext";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";

export default function AppearanceTab({ SectionHeader }) {
  const { accentColor } = useLayout();
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { BG, TEXT } = theme;

  return (
    <div>
      <SectionHeader title="Appearance" />

      {/* Appearance is the theme picker alone. UI scale stays a keyboard
          feature (Cmd+Plus / Cmd+Minus / Cmd+0 in useAppKeyboard); the
          font-size row that sat here was removed on 2026-09-05. */}

      {/* Theme row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 0",
        }}
      >
        <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Theme</span>
        <div
          style={{
            display: "flex",
            borderRadius: radius.default,
            overflow: "hidden",
            border: `1px solid ${BG.divider}`,
          }}
        >
          {/* Stored keys stay "day"/"night"/"auto" so every saved preference
              keeps working; only the labels say Light/Dark/System. Light
              leads — it is the default theme. */}
          {[
            ["day", "Light"],
            ["night", "Dark"],
            ["auto", "System"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setThemeMode(mode)}
              style={{
                background: themeMode === mode ? accentColor : "transparent",
                color: themeMode === mode ? (isDark ? BG.darkest : "#fff") : TEXT.muted,
                border: "none",
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: fontSize.sm,
                fontWeight: fontWeight.medium,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
