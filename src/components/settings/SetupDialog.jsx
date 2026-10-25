import { useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { ThemePills } from "./AppearanceTab";
import { FolderPathControl, SectionTitle, SmallButton } from "./SettingsPrimitives";
import { FolderOpenIcon, NewNoteIcon } from "../Icons";
import { DialogShell } from "./DialogShell";

/** Setup's width: Settings' minus a step, enough for the default path and its button on one line. */
export const SETUP_WIDTH = 480;

/**
 * First-run setup: one compact dialog over the empty app, in
 * Settings' grammar. The notes folder, the appearance and Create note. Every
 * way out ends it the same way: the choice on screen is saved and it never
 * shows again (`onDone`, with "create" for the button and "dismiss" for ×,
 * Escape or a click outside). Nothing here writes a file: the draft note
 * behind the dialog is written at its first keystroke, as every draft is.
 *
 * `folderExists` is false while the default folder is only named: the path is
 * then plain text (a click cannot show a folder that is not there yet).
 * Choosing a folder switches the app behind the scrim live, so an existing
 * Markdown folder shows its notes before you commit; the appearance applies
 * as you click it, so the screen itself is the preview.
 */
export default function SetupDialog({ notesDir, folderExists, onChooseFolder, onReveal, onDone }) {
  const { theme, setThemeMode } = useTheme();
  const { TEXT } = theme;

  // A fresh install starts on System; an existing user never sees this.
  useEffect(() => {
    setThemeMode("auto");
  }, [setThemeMode]);

  const dismiss = () => onDone("dismiss");
  return (
    <DialogShell
      label="Welcome to Boojy Notes"
      title="Welcome to Boojy Notes"
      onClose={dismiss}
      width={SETUP_WIDTH}
      padding="20px 28px 28px"
      headerGap={10}
      scrimTestId="setup-scrim"
    >
      <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: "22px", color: TEXT.secondary }}>
        A simple place to write and organise your notes, saved as Markdown files in a folder you
        choose.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionTitle title="Notes folder" />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
          <FolderPathControl path={notesDir} onReveal={folderExists ? onReveal : undefined} />
          <div style={{ marginLeft: "auto" }}>
            <SmallButton icon={<FolderOpenIcon />} onClick={onChooseFolder}>
              Choose folder…
            </SmallButton>
          </div>
        </div>
      </div>

      <div style={{ height: 24 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionTitle title="Appearance" />
        <ThemePills />
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
        <SmallButton
          kind="strong"
          icon={<NewNoteIcon size={18} />}
          onClick={() => onDone("create")}
          style={{ height: 38, padding: "0 22px", fontSize: 14 }}
        >
          Create note
        </SmallButton>
      </div>
    </DialogShell>
  );
}
