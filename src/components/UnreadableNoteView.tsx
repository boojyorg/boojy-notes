import { useTheme } from "../hooks/useTheme";
import type { Note } from "../types/notes";
import { UnreadableIcon } from "./Icons";
import { SHOW_IN_FOLDER_LABEL, SmallButton } from "./settings/SettingsPrimitives";

interface Props {
  reason: NonNullable<Note["unreadable"]>;
  /** Opens the file in the app the system gives it. */
  openFile: () => void;
  revealFile: () => void;
  /** Reads the file again, as a note that now holds text. */
  retry: () => void;
}

const SAYS: Record<Props["reason"], string> = {
  encoding:
    "This file isn’t saved as UTF-8 text, so Boojy Notes can’t open it without changing it.",
  "too-large": "This file is too large to open as a note.",
  read: "This file couldn’t be read.",
};

/**
 * In the note's place when its file cannot be edited as text: the note is
 * listed, never hidden, and nothing can be typed into it, so its bytes are
 * never written. The file opens in its own app, or is shown where it is.
 */
export default function UnreadableNoteView({ reason, openFile, revealFile, retry }: Props) {
  const { theme } = useTheme();
  return (
    <div
      data-testid="unreadable-note"
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        paddingTop: 4,
        color: theme.TEXT.muted,
        fontSize: 14,
      }}
    >
      <UnreadableIcon />
      <span>{SAYS[reason]}</span>
      <SmallButton onClick={openFile}>Open in Default App</SmallButton>
      <SmallButton onClick={revealFile}>{SHOW_IN_FOLDER_LABEL}</SmallButton>
      <SmallButton onClick={retry}>Try again</SmallButton>
    </div>
  );
}
