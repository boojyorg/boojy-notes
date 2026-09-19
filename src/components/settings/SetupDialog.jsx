import { useEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { fontWeight } from "../../tokens/typography";
import { ThemePills } from "./AppearanceTab";
import {
  FolderPathControl,
  SCRIM,
  SectionTitle,
  SmallButton,
  dialogSurface,
} from "./SettingsPrimitives";
import { CloseIcon, FolderOpenIcon, NewNoteIcon } from "../Icons";
import { atScale } from "../../utils/uiScale";
import { ChromeButton } from "../EditorChrome";

/** Setup's width: Settings' minus a step, enough for the default path and its button on one line. */
export const SETUP_WIDTH = 480;

/**
 * First-run setup (2026-09-17): one compact dialog over the empty app, in
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
  const ref = useRef(null);
  useFocusTrap(ref, true, "container");

  // A fresh install starts on System; an existing user never sees this.
  useEffect(() => {
    setThemeMode("auto");
  }, [setThemeMode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onDone("dismiss");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <>
      <div
        data-testid="setup-scrim"
        onClick={() => onDone("dismiss")}
        style={{ position: "fixed", inset: 0, zIndex: Z.SETTINGS, background: SCRIM }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Boojy Notes"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: Z.SETTINGS_INNER,
          width: SETUP_WIDTH,
          maxWidth: atScale("100vw - 32px"),
          maxHeight: atScale("100vh - 48px"),
          boxSizing: "border-box",
          padding: "20px 28px 28px",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          outline: "none",
          ...dialogSurface(theme),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 32,
            margin: "0 -8px 10px 0",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: fontWeight.semibold, color: TEXT.primary }}>
            Welcome to Boojy Notes
          </div>
          <ChromeButton label="Close" onClick={() => onDone("dismiss")}>
            <CloseIcon />
          </ChromeButton>
        </div>
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
            kind="accent"
            icon={<NewNoteIcon size={18} />}
            onClick={() => onDone("create")}
            style={{ height: 38, padding: "0 22px", fontSize: 14 }}
          >
            Create note
          </SmallButton>
        </div>
      </div>
    </>
  );
}
