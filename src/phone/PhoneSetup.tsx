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
  CheckIcon,
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

/** A phone's button: the desktop's shape at a finger's size, as wide as its words, centred. */
const TOUCH_BUTTON = {
  height: 48,
  padding: "0 28px",
  fontSize: 16,
  borderRadius: 12,
  alignSelf: "center",
};
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
 * A small note, drawn in the theme: what the Appearance row is choosing
 * between. A picture only, so nothing in it is read out or reached.
 */
function PreviewNote() {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const box = { width: 16, height: 16, boxSizing: "border-box", borderRadius: 4, flexShrink: 0 };
  const row = { display: "flex", alignItems: "center", gap: 10 };
  const open = { ...box, border: `1.5px solid ${TEXT.muted}` } as React.CSSProperties;
  const ticked = {
    ...box,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: TEXT.secondary,
    color: theme.BG.editor,
  } as React.CSSProperties;
  return (
    <div
      aria-hidden="true"
      data-testid="setup-preview"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 18px 18px",
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: 14,
        background: theme.BG.editor,
        color: TEXT.primary,
        fontSize: 15,
        lineHeight: "22px",
      }}
    >
      <div style={{ fontSize: 19, lineHeight: "26px", fontWeight: 600 }}>Lisbon trip</div>
      <div>
        Flights on the <strong style={{ fontWeight: 600 }}>14th</strong>, back on the 21st. Hotel
        near the river.
      </div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600 }}>To pack</div>
      <div style={row}>
        <span style={open} />
        Passport
      </div>
      <div style={{ ...row, color: TEXT.muted, textDecoration: "line-through" }}>
        <span style={ticked}>
          <CheckIcon size={12} />
        </span>
        Phone charger
      </div>
      <div style={row}>
        <span style={open} />
        Sun cream
      </div>
      <div style={{ marginTop: 8 }}>
        More in{" "}
        <span
          style={{
            color: theme.link.color,
            textDecoration: "underline",
            textDecorationColor: theme.link.underline,
          }}
        >
          Packing list
        </span>
      </div>
    </div>
  );
}

/**
 * First launch on the phone, in two pages. The first says what the app is
 * and asks nothing. The second is the desktop's setup: the notes folder
 * (`Documents/<folderName>` unless another is chosen) and the appearance,
 * with a small note that shows it. Continue passes through Android's own
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
          <h1
            style={{
              margin: "28px 0 10px",
              fontSize: 26,
              lineHeight: "32px",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {WELCOME_TITLE}
          </h1>
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
        </div>
        <div style={{ flexGrow: 1.4, minHeight: 32 }} />
        <SmallButton kind="strong" onClick={() => setPage(2)} style={TOUCH_BUTTON}>
          {withArrow("Get started")}
        </SmallButton>
      </Page>
    );
  }

  return (
    <Page>
      <button
        type="button"
        aria-label="Back"
        onClick={() => setPage(1)}
        style={{
          width: 44,
          height: 44,
          margin: "-20px 0 8px -12px",
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
      <Title>Set up</Title>
      <div style={{ height: 8 }} />

      {/* The folder is one row: where the notes go, and a tap to change it. */}
      <button
        type="button"
        onClick={choose}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          minHeight: 64,
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
        <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, lineHeight: "20px", color: TEXT.muted }}>
            {NOTES_FOLDER_TITLE}
          </span>
          <span style={{ overflowWrap: "anywhere" }}>
            {chosen ? folderLabel(chosen) : `Documents/${folderName}`}
          </span>
        </span>
        <span style={{ display: "flex", color: TEXT.muted }}>
          <ChevronRightIcon size={18} />
        </span>
      </button>
      {!chosen && (
        <p style={{ margin: "8px 4px 0", fontSize: 14, lineHeight: "20px", color: TEXT.muted }}>
          Android will ask you to confirm it.
        </p>
      )}
      {refused && (
        <p role="alert" style={{ margin: "8px 4px 0", fontSize: 14, color: theme.SEMANTIC.error }}>
          Choose a folder on this phone.
        </p>
      )}

      <div style={{ height: 28 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionTitle title={APPEARANCE_TITLE} />
        <ThemePills />
        <PreviewNote />
      </div>

      <div style={{ flexGrow: 1, minHeight: 32 }} />
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
        {withArrow("Choose the folder again")}
      </SmallButton>
    </Page>
  );
}
