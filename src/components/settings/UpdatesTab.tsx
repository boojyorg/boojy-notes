import { useCallback, type ComponentType } from "react";
import { version as appVersion } from "../../../package.json";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { SettingRow, SmallButton, Switch } from "./SettingsPrimitives";

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

/**
 * Settings → Updates: the automatic-updates switch, then one status line and
 * one button. The button says what it is doing (`Checking…`,
 * `Downloading…`, disabled), the line says what was found; only the ready
 * state changes the button's look, because it is the one that needs a
 * decision. An error keeps its feedback in the error ink with `Try again`.
 */
export default function UpdatesTab({ isDesktop, SectionHeader }: UpdatesTabProps) {
  const { autoUpdateEnabled, setAutoUpdateEnabled, updateStatus } = useSettings() as {
    autoUpdateEnabled: boolean;
    setAutoUpdateEnabled: (enabled: boolean) => void;
    updateStatus: UpdateStatus | null;
  };
  const { theme } = useTheme();
  const { TEXT, SEMANTIC } = theme;

  const handleToggleAutoUpdate = useCallback(
    (enabled: boolean) => {
      setAutoUpdateEnabled(enabled);
      window.electronAPI?.setAutoUpdate?.(enabled);
    },
    [setAutoUpdateEnabled],
  );
  const check = useCallback(() => {
    window.electronAPI?.checkForUpdate?.();
  }, []);
  const install = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  if (!isDesktop) return null;

  const state = updateStatus?.state ?? "idle";
  let status: string;
  let statusColor = TEXT.muted;
  let button: React.ReactNode;
  switch (state) {
    case "checking":
      status = "Checking for updates…";
      button = <SmallButton kind="disabled">Checking…</SmallButton>;
      break;
    case "up-to-date":
      status = `Up to date · v${appVersion} is the latest version`;
      button = <SmallButton onClick={check}>Check for updates</SmallButton>;
      break;
    case "available":
      status = `v${updateStatus?.version} available · downloading`;
      button = <SmallButton kind="disabled">Downloading…</SmallButton>;
      break;
    case "downloading":
      status = `Downloading update · ${updateStatus?.percent ?? 0}%`;
      button = <SmallButton kind="disabled">Downloading…</SmallButton>;
      break;
    case "downloaded":
      status = `v${updateStatus?.version} is ready to install`;
      statusColor = TEXT.primary;
      button = (
        <SmallButton kind="accent" onClick={install}>
          Restart to update
        </SmallButton>
      );
      break;
    case "error":
      status = "Couldn’t check for updates. Try again later.";
      statusColor = SEMANTIC.error;
      button = <SmallButton onClick={check}>Try again</SmallButton>;
      break;
    default:
      status = autoUpdateEnabled ? "Checks for updates when the app starts" : "Not checked yet";
      button = <SmallButton onClick={check}>Check for updates</SmallButton>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHeader title="Updates" />

      <SettingRow label="Automatic updates">
        <Switch
          checked={autoUpdateEnabled}
          label="Automatic updates"
          onChange={handleToggleAutoUpdate}
        />
      </SettingRow>

      <div
        data-testid="update-status"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          minHeight: 30,
        }}
      >
        <div style={{ fontSize: 13, lineHeight: "20px", color: statusColor }}>{status}</div>
        {button}
      </div>
    </div>
  );
}
