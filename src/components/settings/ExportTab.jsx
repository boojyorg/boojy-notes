import { useTheme } from "../../hooks/useTheme";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";
import { isElectronMac } from "../../utils/platform";

/**
 * Settings → Storage: the vault's one home. The path, and the two things you
 * do with it: Show in Finder (moved here from the Notes row's ··· menu on
 * 2026-09-16, when that menu became Sort alone) and Change.
 */
export default function ExportTab({
  isDesktop,
  isMobile,
  notesDir,
  changeNotesDir,
  revealNotesDir,
  SectionHeader,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;

  if (!isDesktop) return null;

  const buttonStyle = {
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
  };
  const lift = (e) => (e.currentTarget.style.background = theme.overlay(0.08));
  const rest = (e) => (e.currentTarget.style.background = theme.overlay(0.05));

  const displayPath = notesDir
    ? notesDir.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/, "~")
    : "\u2014";
  const truncated = displayPath.length > 32 ? "\u2026" + displayPath.slice(-30) : displayPath;

  return (
    <div style={{ marginBottom: isMobile ? spacing.xxxl : 0 }}>
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
          {revealNotesDir && (
            <button
              type="button"
              onClick={revealNotesDir}
              style={buttonStyle}
              onMouseEnter={lift}
              onMouseLeave={rest}
            >
              {isElectronMac ? "Show in Finder" : "Show in folder"}
            </button>
          )}
          <button
            type="button"
            onClick={changeNotesDir}
            style={buttonStyle}
            onMouseEnter={lift}
            onMouseLeave={rest}
          >
            Change
          </button>
        </div>
      </div>
    </div>
  );
}
