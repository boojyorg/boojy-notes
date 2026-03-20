import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { SCALE_OPTIONS } from "../../constants/data";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";

export default function AppearanceTab({ SectionHeader }) {
  const { settingsFontSize, setSettingsFontSize, uiScale, setUiScale } = useSettings();

  const { accentColor } = useLayout();

  const {
    theme,
    themeMode,
    setThemeMode,
    autoMethod,
    setAutoMethod,
    isDark,
    dayStartHour,
    setDayStartHour,
    dayEndHour,
    setDayEndHour,
  } = useTheme();
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
            onClick={() => setSettingsFontSize((prev) => Math.max(10, prev - 1))}
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
            {"\u2212"}
          </button>
          <button
            onClick={() => setSettingsFontSize((prev) => Math.min(24, prev + 1))}
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

      {/* UI Scale row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0 2px",
        }}
      >
        <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>UI Scale</span>
        <select
          value={uiScale}
          onChange={(e) => setUiScale(Number(e.target.value))}
          style={{
            background: theme.overlay(0.05),
            border: `1px solid ${theme.overlay(0.08)}`,
            borderRadius: radius.sm,
            color: TEXT.secondary,
            fontSize: fontSize.sm,
            padding: "2px 4px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {SCALE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}%{s === 100 ? " (Default)" : ""}
            </option>
          ))}
        </select>
      </div>

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
          {["night", "day", "auto"].map((mode) => (
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
                textTransform: "capitalize",
                fontFamily: "inherit",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Auto method row */}
      {themeMode === "auto" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 0 2px",
          }}
        >
          <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>Auto method</span>
          <div
            style={{
              display: "flex",
              borderRadius: radius.default,
              overflow: "hidden",
              border: `1px solid ${BG.divider}`,
            }}
          >
            {[
              { value: "system", label: "System" },
              { value: "time", label: "Time of day" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAutoMethod(opt.value)}
                style={{
                  background: autoMethod === opt.value ? accentColor : "transparent",
                  color: autoMethod === opt.value ? (isDark ? BG.darkest : "#fff") : TEXT.muted,
                  border: "none",
                  padding: "3px 10px",
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.medium,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Schedule row */}
      {themeMode === "auto" && autoMethod === "time" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 0 2px",
          }}
        >
          <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>Schedule</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.sm,
              fontSize: fontSize.sm,
            }}
          >
            <span style={{ color: TEXT.muted }}>Day</span>
            <select
              value={dayStartHour}
              onChange={(e) => setDayStartHour(+e.target.value)}
              style={{
                background: theme.overlay(0.05),
                border: `1px solid ${theme.overlay(0.08)}`,
                borderRadius: radius.sm,
                color: TEXT.secondary,
                fontSize: fontSize.sm,
                padding: "2px 4px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{`${i}:00`}</option>
              ))}
            </select>
            <span style={{ color: TEXT.muted }}>to</span>
            <select
              value={dayEndHour}
              onChange={(e) => setDayEndHour(+e.target.value)}
              style={{
                background: theme.overlay(0.05),
                border: `1px solid ${theme.overlay(0.08)}`,
                borderRadius: radius.sm,
                color: TEXT.secondary,
                fontSize: fontSize.sm,
                padding: "2px 4px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{`${i}:00`}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
