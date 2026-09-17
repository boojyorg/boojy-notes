import { FolderOpenIcon } from "../Icons";
import { FolderPathControl, SmallButton } from "./SettingsPrimitives";

/**
 * Settings → Notes folder: the folder's one home. The glyph and path are one
 * control that shows the folder in Finder (the separate button went on
 * 2026-09-17); `Change folder…` opens the picker, after the app has said that
 * the current notes stay where they are (the confirm lives in BoojyNotes).
 * The path takes the width it needs and wraps at its folders; the button
 * shares its line while there is room and drops under it otherwise, so a
 * long path is never squeezed into a column.
 */
export default function StorageTab({
  isDesktop,
  notesDir,
  changeNotesDir,
  revealNotesDir,
  SectionHeader,
}) {
  if (!isDesktop) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SectionHeader title="Notes folder" />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
        <FolderPathControl path={notesDir} onReveal={revealNotesDir} />
        <div style={{ marginLeft: "auto" }}>
          <SmallButton icon={<FolderOpenIcon />} onClick={changeNotesDir}>
            Change folder…
          </SmallButton>
        </div>
      </div>
    </div>
  );
}
