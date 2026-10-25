import { useLayoutEffect, useState } from "react";
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
  const { settingsOpen, setSettingsOpen, uiScale } = useSettings();

  // The scale the pane opened at. While it is open the app resizes under every
  // press of Interface size, but the pane itself keeps the size and place it
  // opened with: a panel that grows as you press the button inside it moves
  // that button out from under the pointer. It is not excluded from the scale — the next time it opens it
  // is drawn at whatever the scale is then. Captured in a layout effect, so the
  // first paint of an open pane is already at its own scale.
  const [openedAt, setOpenedAt] = useState(uiScale);
  useLayoutEffect(() => {
    if (settingsOpen) setOpenedAt(uiScale);
    // Deliberately not on uiScale: the capture is the *opening*, and a scale
    // change while the pane is open must not move it.
  }, [settingsOpen]);

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
      // Its own scale, held at the one it opened with: `zoom` nests
      // multiplicatively, so this cancels the difference exactly. The local
      // `--ui-scale` keeps the viewport-unit maths resolving against the
      // pane's own scale rather than the app's (`atScale`).
      paneStyle={{
        zoom: openedAt === uiScale ? undefined : openedAt / uiScale,
        "--ui-scale": openedAt / 100,
      }}
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
