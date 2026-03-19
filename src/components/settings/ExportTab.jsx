import { useTheme } from "../../hooks/useTheme";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";

export default function ExportTab({ isDesktop, notesDir, changeNotesDir, SectionHeader }) {
  const { theme } = useTheme();
  const { TEXT } = theme;

  if (!isDesktop) return null;

  const displayPath = notesDir
    ? notesDir.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/, "~")
    : "\u2014";
  const truncated = displayPath.length > 32 ? "\u2026" + displayPath.slice(-30) : displayPath;

  return (
    <div style={{ marginBottom: spacing.xxxl }}>
      <SectionHeader title="Storage" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${spacing.xs}px 0`,
        }}
      >
        <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Notes folder</span>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
          <span
            style={{
              fontSize: fontSize.md,
              color: TEXT.secondary,
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={notesDir}
          >
            {truncated}
          </span>
          <button
            onClick={changeNotesDir}
            style={{
              padding: `${spacing.xs}px 10px`,
              borderRadius: radius.default,
              background: theme.overlay(0.05),
              border: `1px solid ${theme.overlay(0.08)}`,
              color: TEXT.secondary,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = theme.overlay(0.08))}
            onMouseLeave={(e) => (e.currentTarget.style.background = theme.overlay(0.05))}
          >
            Change
          </button>
        </div>
      </div>
    </div>
  );
}
