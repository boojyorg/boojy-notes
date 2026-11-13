import { type RefObject, useRef, useState } from "react";
import {
  CheckIcon,
  CloseIcon,
  FolderIcon,
  MoreHorizontalIcon,
  MoveToIcon,
  PencilIcon,
  SyncingIcon,
  SyncOfflineIcon,
  NewFolderIcon,
  VaultIcon,
} from "../components/Icons";
import Menu, { type MenuAnchor, type MenuItem } from "../components/Menu";
import AppearanceTab from "../components/settings/AppearanceTab";
import SettingsFooter from "../components/settings/SettingsFooter";
import { SectionTitle } from "../components/settings/SettingsPrimitives";
import { syncAction, syncCount, syncLines } from "../components/SyncWords";
import { Z } from "../constants/zIndex";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useHeldScale } from "../hooks/useHeldScale";
import { useModalEscape } from "../hooks/useModalEscape";
import { useTheme } from "../hooks/useTheme";
import { currentEnterMs } from "../tokens/motion";
import { NAV_BAR_H, STATUS_BAR_H } from "../utils/uiScale";
import { type LocationRow, liveRows, whereOf } from "./locations";
import RenameLocation from "./RenameLocation";
import { PageHead, rowStyle } from "./pageParts";
import { reopenSettingsAfterRestart } from "./reopenSettings";
import { APP_FOLDER, folderChosen, folderClash } from "./syncFolder";
import type { PhoneStorage } from "./usePhoneStorage";
import type { PhoneSync } from "./useSyncStatus";

/**
 * A connect's one question, over Settings: which folder in the Dropbox's
 * Boojy Notes these notes sync with. A row is the answer; Back (and Escape)
 * connects nothing. Asked only when Dropbox holds folders there.
 */
function ChooseSyncFolder({
  folders,
  taken,
  onAnswer,
}: {
  folders: string[];
  /** The Dropbox folders this phone's other locations sync with: shown, never offered. */
  taken: string[];
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
    usable = !folderClash(folderChosen(name || " ", folders), taken);
  } catch {
    usable = false;
  }
  const choice = (label: string, folder: string) => {
    // Two locations over one Dropbox folder would each take the other's notes for its own.
    const used = folderClash(folder, taken);
    return (
      <button
        key={label}
        type="button"
        className="press"
        data-testid="sync-folder-choice"
        aria-disabled={used}
        onClick={() => !used && onAnswer(folder)}
        style={{ ...row, color: used ? TEXT.muted : TEXT.primary }}
      >
        <span style={{ display: "flex", color: used ? TEXT.muted : TEXT.secondary }}>
          <FolderIcon size={20} />
        </span>
        <span style={{ flexGrow: 1, minWidth: 0, overflowWrap: "anywhere" }}>{label}</span>
        {used && <span style={{ fontSize: 14 }}>Used by another location</span>}
      </button>
    );
  };
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
        {taken.includes("")
          ? `Another location on this phone syncs with all of ${APP_FOLDER}, so no folder in it is free. Disconnect that one first.`
          : `Choose the folder in your Dropbox's ${APP_FOLDER} that these notes sync with.`}
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

/** A menu's first words: where a synced location's notes are on the phone itself. */
const onPhone = (row: LocationRow) => `On this phone: ${row.phone ?? "inside the app"}`;

/**
 * A storage location, as the desktop lists one: its glyph (a cloud if it
 * syncs), its name, where it is in one line, and a tick on the open one. A
 * press opens that location; its ··· holds what can be done about it, which
 * is only what can work: sync and a move need the location open, a removal
 * needs it closed.
 */
function Location({
  row,
  lines,
  warn,
  items,
  onOpen,
  ticked,
  opening,
}: {
  /** A press is opening a location: no card stays shaded through the restart. */
  opening: boolean;
  row: LocationRow;
  /** The tick: on the open one, or on the one a press is opening. */
  ticked: boolean;
  /** Opens it, for one that is not open: a press on the row, as on the desktop. */
  onOpen?: () => void;
  /** Sync's words, under the open one: only what the glyph can't say. */
  lines: string[];
  warn: boolean;
  items: MenuItem[];
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const close = () => setAnchor(null);
  const where = whereOf(row);
  // The open one is where you are: nothing to press.
  const Body = onOpen ? "button" : "div";
  return (
    <div style={{ marginBottom: 10 }}>
      {/* The desktop's row: a press on it opens that location; its ··· is what can be done to it. */}
      <div
        className="press-card"
        data-opening={opening || undefined}
        style={{ ...rowStyle(theme), padding: 0, gap: 0 }}
      >
        <Body
          {...(onOpen
            ? { type: "button", className: "press-card-body", onClick: onOpen }
            : { "aria-current": "true" })}
          aria-label={`${row.name}: ${where}${row.open ? ", open" : ""}`}
          data-testid={`location-${row.id}`}
          style={{
            flexGrow: 1,
            minWidth: 0,
            minHeight: 56,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 4px 10px 16px",
            border: "none",
            borderRadius: 14,
            background: "transparent",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", color: TEXT.secondary }}>
            <VaultIcon cloud={row.dropbox !== null} size={20} />
          </span>
          <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ overflowWrap: "anywhere" }}>{row.name}</span>
            <span
              style={{
                fontSize: 14,
                lineHeight: "20px",
                color: TEXT.muted,
                overflowWrap: "anywhere",
              }}
            >
              {where}
            </span>
          </span>
          {ticked && (
            <span data-testid="location-tick" style={{ display: "flex", color: TEXT.primary }}>
              <CheckIcon size={18} />
            </span>
          )}
        </Body>
        <button
          type="button"
          className="press"
          aria-label={`More for ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          data-testid={`location-more-${row.id}`}
          onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
          style={{
            width: 48,
            alignSelf: "stretch",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 14,
            background: "transparent",
            color: TEXT.secondary,
          }}
        >
          <MoreHorizontalIcon size={20} />
        </button>
      </div>
      {lines.length > 0 && (
        <p
          role={warn ? "alert" : "status"}
          style={{
            margin: "8px 2px 0",
            fontSize: 14,
            lineHeight: "20px",
            color: warn ? theme.SEMANTIC.warning : TEXT.muted,
          }}
        >
          {lines.map((line) => (
            <span key={line} style={{ display: "block" }}>
              {line}
            </span>
          ))}
        </p>
      )}
      {anchor && (
        <Menu
          label={row.name}
          idPrefix={`location-${row.id}`}
          testId="location-menu"
          anchor={anchor}
          onClose={close}
          maxWidth={300}
          overSettings
          header={
            row.dropbox !== null ? (
              <div
                style={{ padding: "8px 10px", fontSize: 14, lineHeight: 1.45, color: TEXT.muted }}
              >
                {onPhone(row)}
              </div>
            ) : undefined
          }
          items={items.map((item) => ({
            ...item,
            action: () => {
              close();
              item.action?.();
            },
          }))}
        />
      )}
    </div>
  );
}

/** What Remove asks first: the folder stays, but notes kept inside the app go with it. */
export function removePrompt(row: LocationRow) {
  const title = `Remove "${row.name}" from Boojy Notes?`;
  if (row.phone) {
    return {
      title,
      message: `The folder and its notes stay in ${row.phone}.${
        row.dropbox !== null ? " Nothing in Dropbox changes." : ""
      }`,
      confirmLabel: "Remove",
      danger: false,
    };
  }
  return {
    title,
    message: `Its notes are kept inside the app, so they will be deleted from this phone. ${
      row.dropbox !== null ? "The copies in Dropbox stay." : "This can't be undone."
    }`,
    confirmLabel: "Remove and delete",
    danger: true,
  };
}

/**
 * Settings on the phone: a page of its own in Home's place, not the desktop's
 * pane. The storage locations stand as the desktop lists them, each saying
 * where it is, with what can be done about it in its menu: Dropbox is the
 * location's own, not a section beside it. Then the appearance and the
 * version line. Back (Android's is Escape) returns to Home.
 */
export default function PhoneSettings({
  open,
  sync,
  storage,
  confirm,
  onClose,
}: {
  open: boolean;
  sync: PhoneSync | null;
  /** Where the notes are kept: its own, not sync's (`usePhoneStorage`). */
  storage: PhoneStorage;
  /** Asks before a removal (the app's confirm dialog). */
  confirm: (prompt: ReturnType<typeof removePrompt>) => Promise<boolean>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const pageRef = useRef<HTMLDivElement>(null);
  useFocusTrap(pageRef as RefObject<HTMLElement>, open, "container");
  const choosing = sync?.choosing ?? null;
  const [renaming, setRenaming] = useState<LocationRow | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // A question standing over the page takes Back first.
  useModalEscape(open && !choosing && !renaming, onClose);
  // The page keeps the interface size it opened with: the − and + stay under the finger.
  const heldScale = useHeldScale(open);

  if (!open) return null;

  const rows = liveRows(storage.locations, sync?.status.folder);
  const move = storage.moveToFolder;
  // Opened from here, the app starts again here: not on Home, a step away from where it was asked.
  // The tick moves at the press: the app then starts again on this same page, so that is all that changes.
  const openFromHere = async (id: string) => {
    reopenSettingsAfterRestart();
    setOpening(id);
    // The press fades out first, as any press does: the restart would hold it grey.
    const faded = new Promise((done) => setTimeout(done, currentEnterMs()));
    if (await storage.openLocation(id, faded)) return;
    reopenSettingsAfterRestart(false);
    setOpening(null);
  };
  const rename = (row: LocationRow): MenuItem => ({
    label: "Rename…",
    icon: <PencilIcon />,
    testId: "location-rename",
    action: () => setRenaming(row),
  });
  /** The open location's: sync is its own, and only an open one can sync or move. */
  const openItems = (row: LocationRow): MenuItem[] => {
    const act = sync ? syncAction(sync) : null;
    return [
      ...(!sync
        ? []
        : sync.status.state === "off"
          ? [
              {
                label: "Sync with Dropbox…",
                icon: <VaultIcon cloud />,
                testId: "sync-connect",
                action: () => sync.connect(),
              },
            ]
          : [
              ...(act ? [{ ...act, icon: <SyncingIcon /> }] : []),
              {
                label: "Disconnect Dropbox",
                icon: <SyncOfflineIcon />,
                testId: "sync-disconnect",
                action: () => sync.disconnect(),
              },
            ]),
      { ...rename(row), rule: sync !== null },
      ...(move
        ? [
            {
              label: "Move to a folder…",
              icon: <MoveToIcon />,
              testId: "move-to-folder",
              action: () => move(),
            },
          ]
        : []),
    ];
  };
  const closedItems = (row: LocationRow): MenuItem[] => [
    rename(row),
    {
      label: "Remove from list…",
      icon: <CloseIcon size={16} />,
      rule: true,
      testId: "location-remove",
      danger: row.phone === null,
      action: async () => {
        if (await confirm(removePrompt(row))) storage.removeLocation(row.id);
      },
    },
  ];
  // The glyph says synced; words are for what it can't say: trouble, no network, a long sync.
  const state = sync?.status.state;
  const lines =
    sync && (state === "problem" || state === "offline" || syncCount(sync.status))
      ? syncLines(sync.status)
      : [];

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

      {rows.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <SectionTitle title="Storage locations" />
        </div>
      )}
      {rows.map((row) => (
        <Location
          key={row.id}
          row={row}
          ticked={opening === null ? row.open : row.id === opening}
          opening={opening !== null}
          lines={row.open ? lines : []}
          warn={state === "problem"}
          items={row.open ? openItems(row) : closedItems(row)}
          onOpen={row.open ? undefined : () => openFromHere(row.id)}
        />
      ))}

      {/* The desktop's Add folder…: Android's folder screen, and the folder joins the list under its name. */}
      {rows.length > 0 && (
        <button
          type="button"
          className="press"
          data-testid="location-add"
          onClick={() => storage.addLocation()}
          style={{ ...rowStyle(theme), marginBottom: 28 }}
        >
          <span style={{ display: "flex", color: theme.TEXT.secondary }}>
            <NewFolderIcon size={20} />
          </span>
          <span style={{ flexGrow: 1 }}>Add a location…</span>
        </button>
      )}

      {/* The desktop's own section: the theme, and the interface size (the phone has no keys for it). */}
      <AppearanceTab SectionHeader={SectionTitle} />

      <div style={{ flexGrow: 1 }} />
      <SettingsFooter />
      {choosing && (
        <ChooseSyncFolder
          folders={choosing.folders}
          taken={rows.filter((l) => !l.open && l.dropbox !== null).map((l) => l.dropbox as string)}
          onAnswer={choosing.answer}
        />
      )}
      {renaming && (
        <RenameLocation
          name={renaming.name}
          taken={rows.filter((l) => l.id !== renaming.id).map((l) => l.name)}
          onRename={async (name) => {
            if (await storage.renameLocation(renaming.id, name)) setRenaming(null);
          }}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
