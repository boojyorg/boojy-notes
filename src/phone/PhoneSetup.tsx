import { useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  APPEARANCE_TITLE,
  NOTES_FOLDER_TITLE,
  SETUP_LEAD,
  SETUP_POINTS,
  WELCOME_TITLE,
} from "../constants/setupCopy";
import { NAV_BAR_H, STATUS_BAR_H } from "../utils/uiScale";
import {
  ArrowRightIcon,
  BackIcon,
  ChevronRightIcon,
  FolderIcon,
  OpenNoteIcon,
  SyncOffIcon,
  SyncOfflineIcon,
} from "../components/Icons";
import Wordmark from "../components/Wordmark";
import { ThemePills } from "../components/settings/AppearanceTab";
import { SectionTitle, SmallButton } from "../components/settings/SettingsPrimitives";
import {
  FolderAccess,
  type FolderAccessPlugin,
  folderLabel,
  type PickedFolder,
} from "./folderFiles";

/**
 * A phone's button: the desktop's shape at a finger's size, as wide as its
 * words, centred, a step under what it follows (not pinned to the foot: the
 * page reads as one group).
 */
const TOUCH_BUTTON = {
  height: 48,
  marginTop: 36,
  padding: "0 28px",
  fontSize: 16,
  borderRadius: 12,
  alignSelf: "center",
};
/** A first-run page's heading, centred. */
const HEADING = {
  margin: "0 0 10px",
  fontSize: 26,
  lineHeight: "32px",
  fontWeight: 600,
  textAlign: "center",
} as const;
/** A button's words with a glyph after them. */
const withArrow = (label: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    {label}
    <ArrowRightIcon size={18} />
  </span>
);

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
        // The button at the foot stands clear of the edge, where a thumb rests.
        padding: `calc(${STATUS_BAR_H} + 32px) 24px calc(${NAV_BAR_H} + 64px)`,
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

/** A glyph for each of `SETUP_POINTS`, in their order: a file, no connection, a cloud. */
const POINT_ICONS = [OpenNoteIcon, SyncOfflineIcon, SyncOffIcon];

/**
 * First launch on the phone, in two pages. The first says what the app is
 * and asks nothing. The second is the desktop's setup: the notes folder
 * (`Documents/<folderName>` unless another is chosen) and the appearance,
 *  Continue passes through Android's own
 * folder screen once (an app cannot take a shared folder unasked); a folder
 * already granted goes straight on.
 *
 * Keeping the notes inside the app is not offered up front: it is the answer
 * that loses them on uninstall. It appears once Android's screen was left or
 * a folder refused, so nobody is held at setup. `onDone` gets the folder, or
 * null for the app's own storage.
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
  const [page, setPage] = useState<1 | 2>(granted ? 2 : 1);
  const [chosen, setChosen] = useState<PickedFolder | null>(granted);
  const [refused, setRefused] = useState(false);
  const [offerApp, setOfferApp] = useState(false);

  // A fresh install starts on System, as the desktop's does.
  useEffect(() => {
    setThemeMode("auto");
  }, [setThemeMode]);

  // Android's Back: the first page from the second, out of the app from the first.
  useEffect(() => {
    let remove: (() => void) | undefined;
    let gone = false;
    import("@capacitor/app").then(({ App }) => {
      if (gone) return;
      const handle = App.addListener("backButton", () => {
        if (page === 2) setPage(1);
        else App.minimizeApp();
      });
      remove = () => handle.then((h) => h.remove());
    });
    return () => {
      gone = true;
      remove?.();
    };
  }, [page]);

  const taken = (got: PickedFolder | "refused" | null) => {
    setRefused(got === "refused");
    if (got && got !== "refused") return got;
    setOfferApp(true);
    return null;
  };
  const choose = async () => {
    const got = taken(await pickFolder(access));
    if (got) setChosen(got);
  };
  const folderPath = chosen ? folderLabel(chosen) : `Documents/${folderName}`;
  const carryOn = async () => {
    if (chosen) return onDone(chosen);
    // Made first, so Android's screen opens inside it.
    const { initial } = await access.ensureDefault({ name: folderName });
    const got = taken(await pickFolder(access, initial));
    if (got) onDone(got);
  };

  if (page === 1) {
    // Centred, and a little above the middle: a first screen, not a form.
    return (
      <Page>
        <div style={{ flexGrow: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Wordmark height={40} />
          <h1 style={{ ...HEADING, marginTop: 28 }}>{WELCOME_TITLE}</h1>
          <p
            style={{
              margin: "0 0 36px",
              fontSize: 18,
              lineHeight: "27px",
              textAlign: "center",
              color: TEXT.secondary,
            }}
          >
            {SETUP_LEAD}
          </p>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {SETUP_POINTS.map((point, i) => {
              const Icon = POINT_ICONS[i];
              return (
                <li key={point} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "flex", color: TEXT.secondary }}>
                    <Icon size={20} />
                  </span>
                  {point}
                </li>
              );
            })}
          </ul>
          <SmallButton kind="strong" onClick={() => setPage(2)} style={TOUCH_BUTTON}>
            {withArrow("Get started")}
          </SmallButton>
        </div>
        <div style={{ flexGrow: 1.4 }} />
      </Page>
    );
  }

  // The same shape as the first page: one centred group, a little above the middle.
  return (
    <Page>
      {/* Back, and the mark on its line: the same app as the page before. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center",
          margin: "-20px -12px 0",
        }}
      >
        <button
          type="button"
          aria-label="Back"
          onClick={() => setPage(1)}
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: TEXT.primary,
          }}
        >
          <BackIcon />
        </button>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Wordmark height={20} />
        </div>
      </div>
      <div style={{ flexGrow: 1 }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <h1 style={{ ...HEADING, marginBottom: 24 }}>Set up</h1>

        {/* The folder: its name over a row that holds the path and changes it, and what it is under. */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <SectionTitle title={NOTES_FOLDER_TITLE} />
        </div>
        <button
          type="button"
          aria-label={`${NOTES_FOLDER_TITLE}: ${folderPath}`}
          onClick={choose}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            minHeight: 56,
            padding: "10px 12px 10px 16px",
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 14,
            background: theme.BG.editor,
            color: TEXT.primary,
            font: "inherit",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", color: TEXT.secondary }}>
            <FolderIcon size={20} />
          </span>
          <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: "anywhere" }}>{folderPath}</span>
          <span style={{ display: "flex", color: TEXT.muted }}>
            <ChevronRightIcon size={18} />
          </span>
        </button>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 14,
            lineHeight: "20px",
            textAlign: "center",
            color: TEXT.muted,
          }}
        >
          Where your notes are saved, as ordinary files.
          {!chosen && (
            <>
              <br />
              <span>Android will ask you to confirm it.</span>
            </>
          )}
        </p>
        {refused && (
          <p
            role="alert"
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              textAlign: "center",
              color: theme.SEMANTIC.error,
            }}
          >
            Choose a folder on this phone.
          </p>
        )}

        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <SectionTitle title={APPEARANCE_TITLE} />
          {/* The pills carry a left pull for a left edge: undone, so they sit centred. */}
          <div style={{ paddingLeft: 12 }}>
            <ThemePills />
          </div>
        </div>

        <SmallButton kind="strong" onClick={carryOn} style={TOUCH_BUTTON}>
          {withArrow("Continue")}
        </SmallButton>
        {offerApp && (
          // The way on for someone who will not, or cannot, give a folder; its cost in the same breath.
          <button
            type="button"
            onClick={() => onDone(null)}
            style={{
              margin: "12px 0 0",
              minHeight: 44,
              border: "none",
              background: "transparent",
              font: "inherit",
              fontSize: 15,
              lineHeight: "22px",
              color: theme.link.color,
            }}
          >
            Or keep notes inside the app{" "}
            <span style={{ color: TEXT.muted, whiteSpace: "nowrap" }}>(removed on uninstall)</span>
          </button>
        )}
      </div>
      <div style={{ flexGrow: 1.4 }} />
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
      <SmallButton kind="strong" onClick={again} style={TOUCH_BUTTON}>
        {withArrow("Choose the folder again")}
      </SmallButton>
    </Page>
  );
}

/**
 * In the app's place while a move from the app's storage into a folder runs
 * (`moveToFolder.ts`), before the app starts in that folder. Nothing to press:
 * closing the app is safe, and the next start carries on.
 */
export function MovingNotes({ done, total }: { done: number; total: number }) {
  const { theme } = useTheme();
  return (
    <Page>
      <div style={{ flexGrow: 1 }} />
      <h1 style={HEADING}>Moving your notes</h1>
      <p
        role="status"
        style={{ margin: 0, textAlign: "center", color: theme.TEXT.secondary }}
        data-testid="moving-count"
      >
        {total ? `${done} of ${total} files` : "Getting ready…"}
      </p>
      <div style={{ flexGrow: 2 }} />
    </Page>
  );
}

/** A move that could not finish: the notes are where they were, and the app opens there. */
export function NotMoved({ reason, onDone }: { reason: string; onDone: () => void }) {
  const { theme } = useTheme();
  return (
    <Page>
      <Title>Your notes were not moved</Title>
      <p style={{ margin: 0, color: theme.TEXT.secondary }}>
        They are still inside the app, unchanged. Files already copied to the folder were left
        there; you can delete them.
      </p>
      <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, color: theme.SEMANTIC.error }}>
        {reason}
      </p>
      <SmallButton kind="strong" onClick={onDone} style={TOUCH_BUTTON}>
        {withArrow("Continue")}
      </SmallButton>
    </Page>
  );
}
