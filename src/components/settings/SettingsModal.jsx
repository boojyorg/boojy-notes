import { useHeldScale } from "../../hooks/useHeldScale";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import AppearanceTab from "./AppearanceTab";
import UpdatesTab from "./UpdatesTab";
import SpellingSection from "./SpellingSection";
import StorageTab from "./StorageTab";
import SettingsFooter from "./SettingsFooter";
import { SectionTitle, SettingsRule } from "./SettingsPrimitives";
import { DialogShell } from "./DialogShell";
import { SettingsIcon } from "../Icons";

/** Settings' width: room for a long notes-folder path beside its button. */
export const SETTINGS_WIDTH = 540;

export default function SettingsModal({
  isDesktop,
  vaults,
  switchVault,
  addVault,
  forgetVault,
  renameVault,
  revealVault,
}) {
  const { settingsOpen, setSettingsOpen } = useSettings();

  // The pane keeps the interface size it opened with (`useHeldScale`).
  const heldScale = useHeldScale(settingsOpen);

  const { theme } = useTheme();
  const { TEXT } = theme;

  // One pane on the search palette's surface: Appearance, the
  // notes folder and Updates, parted by rules, then the quiet version line.
  // No navigation and no branding block; the cog beside the title is the one
  // glyph, the same one the ··· menu gives Settings.
  return (
    <DialogShell
      open={settingsOpen}
      label="Settings"
      title={
        <>
          <span style={{ display: "inline-flex", color: TEXT.secondary }}>
            <SettingsIcon size={18} />
          </span>
          <span>Settings</span>
        </>
      }
      onClose={() => setSettingsOpen(false)}
      closeAriaLabel="Close settings"
      width={SETTINGS_WIDTH}
      padding="20px 28px"
      headerGap={20}
      paneProps={{ "data-settings-pane": "" }}
      paneStyle={heldScale}
    >
      <AppearanceTab SectionHeader={SectionTitle} />
      {isDesktop && (
        <>
          <SettingsRule />
          <StorageTab
            SectionHeader={SectionTitle}
            vaults={vaults}
            switchVault={switchVault}
            addVault={addVault}
            forgetVault={forgetVault}
            renameVault={renameVault}
            revealVault={revealVault}
          />
          <SettingsRule />
          <SpellingSection SectionHeader={SectionTitle} />
          <SettingsRule />
          <UpdatesTab SectionHeader={SectionTitle} />
        </>
      )}
      <SettingsFooter />
    </DialogShell>
  );
}
