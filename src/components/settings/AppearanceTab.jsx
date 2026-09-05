import { useTheme } from "../../hooks/useTheme";
import { useSettings, FONT_SIZE_MIN, FONT_SIZE_MAX } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";

export default function AppearanceTab({ SectionHeader }) {
  const { settingsFontSize, setSettingsFontSize } = useSettings();

  const { accentColor } = useLayout();

  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { BG, TEXT } = theme;

  return (
    <div>
      <SectionHeader title="Appearance" />
      {/* Font size row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 0",
        }}
      >
        <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Font size</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: fontSize.md,
              color: TEXT.secondary,
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {settingsFontSize}
          </span>
          <button
            onClick={() => setSettingsFontSize((prev) => Math.max(FONT_SIZE_MIN, prev - 1))}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.overlay(0.08))}
            onMouseLeave={(e) => (e.currentTarget.style.background = theme.overlay(0.05))}
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.default,
              background: theme.overlay(0.05),
              border: `1px solid ${theme.overlay(0.08)}`,
              color: TEXT.secondary,
              fontSize: 15,
              fontWeight: fontWeight.medium,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
              fontFamily: "inherit",
            }}
          >
            {"−"}
          </button>
          <button
            onClick={() => setSettingsFontSize((prev) => Math.min(FONT_SIZE_MAX, prev + 1))}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.overlay(0.08))}
            onMouseLeave={(e) => (e.currentTarget.style.background = theme.overlay(0.05))}
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.default,
              background: theme.overlay(0.05),
              border: `1px solid ${theme.overlay(0.08)}`,
              color: TEXT.secondary,
              fontSize: 15,
              fontWeight: fontWeight.medium,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
              fontFamily: "inherit",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* UI scale has no settings row — it stays a keyboard feature
          (Cmd+Plus / Cmd+Minus / Cmd+0 in useAppKeyboard). */}

      {/* Theme row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0 2px",
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
