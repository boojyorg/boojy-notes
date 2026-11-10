import { useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  APPEARANCE_TITLE,
  NOTES_FOLDER_TITLE,
  SETUP_INTRO,
  WELCOME_TITLE,
} from "../constants/setupCopy";
import { NAV_BAR_H, STATUS_BAR_H } from "../utils/uiScale";
import { FolderOpenIcon } from "../components/Icons";
import { ThemePills } from "../components/settings/AppearanceTab";
import { SectionTitle, SmallButton } from "../components/settings/SettingsPrimitives";
import {
  FolderAccess,
  type FolderAccessPlugin,
  folderLabel,
  type PickedFolder,
} from "./folderFiles";

/** A phone's button: the desktop's shape at a finger's size. */
const TOUCH_BUTTON = { height: 48, fontSize: 16, borderRadius: 12, justifyContent: "center" };

/** The page both first-run screens stand on: the app's ground, clear of Android's bars. */
function Page({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: `calc(${STATUS_BAR_H} + 32px) 24px calc(${NAV_BAR_H} + 20px)`,
        background: theme.BG.standard,
        color: theme.TEXT.primary,
        fontSize: 16,
        lineHeight: "24px",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1 style={{ margin: "0 0 12px", fontSize: 24, lineHeight: "30px", fontWeight: 600 }}>
    {children}
  </h1>
);

/** Asks Android for a folder; null when the picker was left, `refused` for one not on the phone. */
async function pickFolder(
  access: FolderAccessPlugin,
  initial?: string,
): Promise<PickedFolder | "refused" | null> {
  const got = await access.pick(initial ? { initial } : {});
  if (got.refused) return "refused";
  return got.picked && got.tree && got.root ? { tree: got.tree, root: got.root } : null;
}

/**
 * First launch on the phone: the desktop's setup in its words and order.
 * The notes folder is `Documents/<folderName>` unless another is chosen, and
 * Continue passes through Android's own folder screen once (an app cannot
 * take a shared folder unasked); a folder already granted goes straight on.
 * "Keep notes inside the app" is the other answer. `onDone` gets the folder,
 * or null for the app's own storage. Leaving Android's screen changes nothing.
 */
export function PhoneSetup({
  folderName,
  granted = null,
  onDone,
  access = FolderAccess,
}: {
  folderName: string;
  /** A folder this install already holds (a setup cut short after its choice). */
  granted?: PickedFolder | null;
  onDone: (folder: PickedFolder | null) => void;
  access?: FolderAccessPlugin;
}) {
  const { theme, setThemeMode } = useTheme();
  const { TEXT } = theme;
  const [chosen, setChosen] = useState<PickedFolder | null>(granted);
  const [refused, setRefused] = useState(false);

  // A fresh install starts on System, as the desktop's does.
  useEffect(() => {
    setThemeMode("auto");
  }, [setThemeMode]);

  const taken = (got: PickedFolder | "refused" | null) => {
    setRefused(got === "refused");
    return got && got !== "refused" ? got : null;
  };
  const choose = async () => {
    const got = taken(await pickFolder(access));
    if (got) setChosen(got);
  };
  const carryOn = async () => {
    if (chosen) return onDone(chosen);
    // Made first, so Android's screen opens inside it.
    const { initial } = await access.ensureDefault({ name: folderName });
    const got = taken(await pickFolder(access, initial));
    if (got) onDone(got);
  };

  return (
    <Page>
      <Title>{WELCOME_TITLE}</Title>
      <p style={{ margin: "0 0 28px", color: TEXT.secondary }}>{SETUP_INTRO}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <SectionTitle title={NOTES_FOLDER_TITLE} />
        <div style={{ overflowWrap: "anywhere" }}>
          {chosen ? folderLabel(chosen) : `Documents/${folderName}`}
        </div>
        <SmallButton
          icon={<FolderOpenIcon />}
          onClick={choose}
          style={{ height: 44, fontSize: 15 }}
        >
          Choose folder…
        </SmallButton>
        {refused && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: theme.SEMANTIC.error }}>
            Choose a folder on this phone.
          </p>
        )}
      </div>

      <div style={{ height: 28 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionTitle title={APPEARANCE_TITLE} />
        <ThemePills />
      </div>

      <div style={{ flexGrow: 1, minHeight: 32 }} />
      <SmallButton kind="strong" onClick={carryOn} style={TOUCH_BUTTON}>
        Continue
      </SmallButton>
      {!chosen && (
        <p style={{ margin: "10px 0 0", fontSize: 14, textAlign: "center", color: TEXT.muted }}>
          Android will ask you to confirm the folder.
        </p>
      )}
      <button
        type="button"
        onClick={() => onDone(null)}
        style={{
          margin: "20px 0 0",
          minHeight: 44,
          border: "none",
          background: "transparent",
          font: "inherit",
          fontSize: 15,
          color: TEXT.secondary,
        }}
      >
        Keep notes inside the app
      </button>
      <p style={{ margin: 0, fontSize: 14, textAlign: "center", color: TEXT.muted }}>
        Removed if you uninstall.
      </p>
    </Page>
  );
}

/**
 * In the app's place when the chosen folder cannot be reached (moved,
 * renamed, removed, or its permission taken away). The only way on is to
 * choose it again: the app's own storage is never offered here, where it
 * would read as every note being gone.
 */
export function FolderLost({
  onDone,
  access = FolderAccess,
}: {
  onDone: (folder: PickedFolder) => void;
  access?: FolderAccessPlugin;
}) {
  const { theme } = useTheme();
  const [refused, setRefused] = useState(false);
  const again = async () => {
    const got = await pickFolder(access);
    setRefused(got === "refused");
    if (got && got !== "refused") onDone(got);
  };
  return (
    <Page>
      <Title>Boojy Notes can't reach your notes folder</Title>
      <p style={{ margin: 0, color: theme.TEXT.secondary }}>
        It was moved, renamed or removed, or its permission was taken away. Boojy Notes has changed
        nothing. Choose the folder again to carry on.
      </p>
      {refused && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, color: theme.SEMANTIC.error }}>
          Choose a folder on this phone.
        </p>
      )}
      <div style={{ flexGrow: 1, minHeight: 32 }} />
      <SmallButton kind="strong" onClick={again} style={TOUCH_BUTTON}>
        Choose the folder again
      </SmallButton>
    </Page>
  );
}
