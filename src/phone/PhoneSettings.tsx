import { type ComponentType, type ReactNode, type RefObject, useRef, useState } from "react";
import { BackIcon, ChevronRightIcon, FolderIcon, NewFolderIcon } from "../components/Icons";
import Menu, { type MenuAnchor, type MenuItem } from "../components/Menu";
import AppearanceTab from "../components/settings/AppearanceTab";
import SettingsFooter from "../components/settings/SettingsFooter";
import { SectionTitle } from "../components/settings/SettingsPrimitives";
import { SYNC_GLYPH, syncAction, syncLines } from "../components/SyncStatusButton";
import { NOTES_FOLDER_TITLE } from "../constants/setupCopy";
import { Z } from "../constants/zIndex";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useHeldScale } from "../hooks/useHeldScale";
import { useModalEscape } from "../hooks/useModalEscape";
import { useTheme } from "../hooks/useTheme";
import { NAV_BAR_H, STATUS_BAR_H } from "../utils/uiScale";
import { APP_FOLDER, folderChosen, syncFolderName, syncFolderPath } from "./syncFolder";
import type { PhoneStorage } from "./usePhoneStorage";
import type { PhoneSync } from "./useSyncStatus";

const BACK = 44;

type Theme = ReturnType<typeof useTheme>["theme"];

/** A row of the page: a glyph, what it says, and room for its chevron. */
const rowStyle = ({ TEXT, BG }: Theme) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    minHeight: 56,
    boxSizing: "border-box",
    padding: "10px 12px 10px 16px",
    border: `1px solid ${BG.divider}`,
    borderRadius: 14,
    background: BG.editor,
    color: TEXT.primary,
    font: "inherit",
    textAlign: "left",
  }) as const;

/** Back, and the page's name centred on its line, as the note's header has it. */
function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${BACK}px 1fr ${BACK}px`,
        alignItems: "center",
        margin: "4px -12px 20px",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        style={{
          width: BACK,
          height: BACK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          background: "transparent",
          color: theme.TEXT.primary,
        }}
      >
        <BackIcon />
      </button>
      <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, textAlign: "center" }}>{title}</h1>
    </div>
  );
}

/**
 * A connect's one question, over Settings: which folder in the Dropbox's
 * Boojy Notes these notes sync with. A row is the answer; Back (and Escape)
 * connects nothing. Asked only when Dropbox holds folders there.
 */
function ChooseSyncFolder({
  folders,
  onAnswer,
}: {
  folders: string[];
  onAnswer: (folder: string | null) => void;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  useModalEscape(true, () => onAnswer(null));
  const row = rowStyle(theme);
  let usable = true;
  try {
    folderChosen(name || " ", folders);
  } catch {
    usable = false;
  }
  const choice = (label: string, folder: string) => (
    <button
      key={label}
      type="button"
      className="press"
      data-testid="sync-folder-choice"
      onClick={() => onAnswer(folder)}
      style={row}
    >
      <span style={{ display: "flex", color: TEXT.secondary }}>
        <FolderIcon size={20} />
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: "anywhere" }}>{label}</span>
    </button>
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dropbox folder"
      data-testid="choose-sync-folder"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: `${STATUS_BAR_H} 20px calc(${NAV_BAR_H} + 16px)`,
        background: BG.standard,
        overflowY: "auto",
      }}
    >
      <PageHead title="Dropbox folder" onBack={() => onAnswer(null)} />
      <p style={{ margin: "0 2px 10px", fontSize: 14, lineHeight: "20px", color: TEXT.muted }}>
        Your Dropbox already has folders in {APP_FOLDER}. Choose what this phone's notes sync with.
      </p>
      {choice(`Everything in ${APP_FOLDER}`, "")}
      {folders.map((folder) => choice(folder, folder))}
      {naming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (usable) onAnswer(name);
          }}
          style={{ ...row, padding: "6px 8px 6px 16px" }}
        >
          <span style={{ display: "flex", color: TEXT.secondary }}>
            <NewFolderIcon size={20} />
          </span>
          <input
            autoFocus
            aria-label="New folder's name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            style={{
              flexGrow: 1,
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: TEXT.primary,
              font: "inherit",
            }}
          />
          <button
            type="submit"
            aria-disabled={!usable}
            style={{
              minHeight: 44,
              padding: "0 14px",
              border: `1px solid ${BG.divider}`,
              borderRadius: 10,
              background: "transparent",
              color: usable ? TEXT.primary : TEXT.muted,
              font: "inherit",
              fontWeight: 600,
            }}
          >
            Create
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="press"
          data-testid="sync-folder-new"
          onClick={() => setNaming(true)}
          style={row}
        >
          <span style={{ display: "flex", color: TEXT.secondary }}>
            <NewFolderIcon size={20} />
          </span>
          <span style={{ flexGrow: 1 }}>New folder…</span>
        </button>
      )}
    </div>
  );
}

/**
 * One thing Settings holds: its name over a row that says how it stands, and
 * a muted line under it. A row with something to do is a button that opens
 * its menu beside itself; one with nothing to do is only read.
 */
function Setting({
  title,
  Glyph,
  value,
  note,
  items,
  testId,
}: {
  title: string;
  Glyph: ComponentType<{ size?: number }>;
  value: string;
  note: ReactNode;
  items: MenuItem[];
  testId: string;
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const close = () => setAnchor(null);
  const row = rowStyle(theme);
  const inside = (
    <>
      <span style={{ display: "flex", color: TEXT.secondary }}>
        <Glyph size={20} />
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
      {items.length > 0 && (
        <span style={{ display: "flex", color: TEXT.muted }}>
          <ChevronRightIcon size={18} />
        </span>
      )}
    </>
  );
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 10 }}>
        <SectionTitle title={title} />
      </div>
      {items.length > 0 ? (
        <button
          type="button"
          aria-label={`${title}: ${value}`}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          data-testid={testId}
          onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
          style={row}
        >
          {inside}
        </button>
      ) : (
        <div data-testid={testId} style={row}>
          {inside}
        </div>
      )}
      <p style={{ margin: "10px 2px 0", fontSize: 14, lineHeight: "20px", color: TEXT.muted }}>
        {note}
      </p>
      {anchor && (
        <Menu
          label={title}
          idPrefix={testId}
          testId={`${testId}-menu`}
          anchor={anchor}
          onClose={close}
          maxWidth={300}
          overSettings
          items={items.map((item) => ({
            ...item,
            action: () => {
              close();
              item.action?.();
            },
          }))}
        />
      )}
    </section>
  );
}

/**
 * Settings on the phone: a page of its own in Home's place, not the desktop's
 * pane. Where the notes are kept and Dropbox each stand as one row saying how
 * things are, with what can be done about it in the row's menu; then the
 * appearance and the version line. Back (Android's is Escape) returns to Home.
 */
export default function PhoneSettings({
  open,
  sync,
  storage,
  onClose,
}: {
  open: boolean;
  sync: PhoneSync | null;
  /** Where the notes are kept: its own, not sync's (`usePhoneStorage`). */
  storage: PhoneStorage;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const pageRef = useRef<HTMLDivElement>(null);
  useFocusTrap(pageRef as RefObject<HTMLElement>, open, "container");
  const choosing = sync?.choosing ?? null;
  // The folder's question stands over the page and takes Back first.
  useModalEscape(open && !choosing, onClose);
  // The page keeps the interface size it opened with: the − and + stay under the finger.
  const heldScale = useHeldScale(open);

  if (!open) return null;

  const folder = storage.notesFolder;
  const move = storage.moveToFolder;
  const act = sync ? syncAction(sync) : null;
  const dropbox: MenuItem[] = !sync
    ? []
    : sync.status.state === "off"
      ? [{ label: "Connect Dropbox", testId: "sync-connect", action: () => sync.connect() }]
      : [
          ...(act ? [act] : []),
          {
            label: "Disconnect Dropbox",
            testId: "sync-disconnect",
            action: () => sync.disconnect(),
          },
        ];

  return (
    <div
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      tabIndex={-1}
      data-testid="phone-settings"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.SETTINGS_INNER,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: `${STATUS_BAR_H} 20px calc(${NAV_BAR_H} + 16px)`,
        background: theme.BG.standard,
        color: theme.TEXT.primary,
        fontSize: 16,
        lineHeight: "24px",
        overflowY: "auto",
        outline: "none",
        ...heldScale,
      }}
    >
      <PageHead title="Settings" onBack={onClose} />

      <Setting
        title={NOTES_FOLDER_TITLE}
        Glyph={FolderIcon}
        testId="settings-folder"
        value={folder ?? "Inside the app"}
        note={
          folder
            ? "Your notes are ordinary files in this folder, on your phone."
            : "Notes kept inside the app are removed if you uninstall it."
        }
        items={
          move
            ? [{ label: "Move to a folder…", testId: "move-to-folder", action: () => move() }]
            : []
        }
      />

      {sync && (
        <Setting
          title="Dropbox"
          Glyph={SYNC_GLYPH[sync.status.state]}
          testId="settings-dropbox"
          // The folder's name alone: the line under it says how sync stands.
          value={sync.status.folder === null ? "Not connected" : syncFolderName(sync.status.folder)}
          // Dropbox names the Apps folder in the account's language, and the app can't see it.
          note={[
            ...syncLines(sync.status),
            ...(sync.status.folder === null
              ? []
              : [
                  `On a computer: ${syncFolderPath(sync.status.folder)}, in your Dropbox's Apps folder.`,
                ]),
          ].map((line) => (
            <span key={line} style={{ display: "block" }}>
              {line}
            </span>
          ))}
          items={dropbox}
        />
      )}

      {/* The desktop's own section: the theme, and the interface size (the phone has no keys for it). */}
      <AppearanceTab SectionHeader={SectionTitle} />

      <div style={{ flexGrow: 1 }} />
      <SettingsFooter />
      {choosing && <ChooseSyncFolder folders={choosing.folders} onAnswer={choosing.answer} />}
    </div>
  );
}
