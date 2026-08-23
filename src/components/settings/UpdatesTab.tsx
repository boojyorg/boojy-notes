import { useCallback, type ComponentType } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";
import { buttonBase } from "../../styles/buttons";

interface UpdatesTabProps {
  isDesktop: boolean;
  SectionHeader: ComponentType<{ title: string }>;
}

interface UpdateStatus {
  state: "idle" | "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

interface UpdatesTheme {
  TEXT: { primary: string; secondary: string; muted: string };
  ACCENT: { primary: string };
  SEMANTIC: { error: string };
  overlay: (alpha: number) => string;
}

export default function UpdatesTab({ isDesktop, SectionHeader }: UpdatesTabProps) {
  const { autoUpdateEnabled, setAutoUpdateEnabled, updateStatus } = useSettings() as {
    autoUpdateEnabled: boolean;
    setAutoUpdateEnabled: (enabled: boolean) => void;
    updateStatus: UpdateStatus | null;
  };

  const { accentColor } = useLayout() as { accentColor: string };

  const { theme } = useTheme() as { theme: UpdatesTheme };
  const { TEXT, ACCENT, SEMANTIC } = theme;

  const handleToggleAutoUpdate = useCallback(
    (enabled: boolean) => {
      setAutoUpdateEnabled(enabled);
      window.electronAPI?.setAutoUpdate?.(enabled);
    },
    [setAutoUpdateEnabled],
  );

  const handleCheckForUpdate = useCallback(() => {
    window.electronAPI?.checkForUpdate?.();
  }, []);

  const handleInstallUpdate = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  if (!isDesktop) return null;

  return (
    <div>
      <SectionHeader title="Updates" />

      {/* Auto-update toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 0",
        }}
      >
        <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Auto-update</span>
        <button
          type="button"
          role="switch"
          aria-checked={autoUpdateEnabled}
          aria-label="Auto-update"
          onClick={() => handleToggleAutoUpdate(!autoUpdateEnabled)}
          style={{
            width: 36,
            height: 20,
            boxSizing: "border-box",
            borderRadius: 10,
            background: autoUpdateEnabled ? accentColor : theme.overlay(0.06),
            border: `1px solid ${autoUpdateEnabled ? accentColor : theme.overlay(0.08)}`,
            position: "relative",
            cursor: "pointer",
            transition: "background 0.15s",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 3,
              left: autoUpdateEnabled ? 19 : 3,
              transition: "left 0.15s",
            }}
          />
        </button>
      </div>

      {/* Update status */}
      <div style={{ padding: "10px 0 2px" }}>
        {updateStatus?.state === "checking" && (
          <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>Checking for updates...</span>
        )}
        {updateStatus?.state === "up-to-date" && (
          <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>Up to date</span>
        )}
        {updateStatus?.state === "available" && (
          <span style={{ fontSize: fontSize.sm, color: ACCENT.primary }}>
            Update available: v{updateStatus.version}
          </span>
        )}
        {updateStatus?.state === "downloading" && (
          <div>
            <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>
              Downloading... {updateStatus.percent}%
            </span>
            <div
              style={{
                marginTop: 6,
                height: 4,
                borderRadius: 2,
                background: theme.overlay(0.06),
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${updateStatus.percent}%`,
                  height: "100%",
                  background: accentColor,
                  borderRadius: 2,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
        )}
        {updateStatus?.state === "downloaded" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: fontSize.sm, color: ACCENT.primary }}>
              v{updateStatus.version} ready to install
            </span>
            <button
              onClick={handleInstallUpdate}
              style={{
                ...buttonBase,
                background: accentColor,
                color: "#fff",
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: fontSize.sm,
              }}
            >
              Restart & Update
            </button>
          </div>
        )}
        {updateStatus?.state === "error" && (
          <span style={{ fontSize: fontSize.sm, color: SEMANTIC?.error || "#f44" }}>
            Update error: {updateStatus.message}
          </span>
        )}
        {(!updateStatus || updateStatus.state === "idle") && (
          <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>No update check yet</span>
        )}
      </div>

      {/* Check for Updates button */}
      <div style={{ padding: "8px 0" }}>
        <button
          onClick={handleCheckForUpdate}
          disabled={updateStatus?.state === "checking" || updateStatus?.state === "downloading"}
          style={{
            background: theme.overlay(0.05),
            border: `1px solid ${theme.overlay(0.08)}`,
            borderRadius: radius.default,
            color: TEXT.secondary,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.medium,
            padding: "5px 14px",
            cursor:
              updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                ? "not-allowed"
                : "pointer",
            opacity:
              updateStatus?.state === "checking" || updateStatus?.state === "downloading" ? 0.5 : 1,
            transition: "background 0.15s",
            fontFamily: "inherit",
          }}
        >
          Check for Updates
        </button>
      </div>
    </div>
  );
}
