import { useRef, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  ClipboardIcon,
  CopyIcon,
  FormattedViewIcon,
  MoveToIcon,
  NewFolderIcon,
  NewNoteIcon,
  OpenLinkIcon,
  PencilIcon,
  RevealIcon,
  SettingsIcon,
  SourceViewIcon,
  TrashIcon,
  HistoryIcon,
  LinkIcon,
  OpenNoteIcon,
} from "./Icons";
import { SHOW_IN_FOLDER_LABEL } from "./settings/SettingsPrimitives";
import { isMac, isPhone } from "../utils/platform";

/** Link Page in Note's key, as the menu bar's accelerator shows it. */
const LINK_PAGE_KEY = isMac ? "⌥⌘L" : "Ctrl+Alt+L";
import { shortcutLabel } from "./Tooltip";
import { useSettings } from "../context/SettingsContext";
import Menu, { MenuRule } from "./Menu";

/** `412 words`: the number a note is measured by; nobody writes a note to a
 *  character limit. */
const noteStatsLabel = (words) => `${words} word${words === 1 ? "" : "s"}`;

const ContextMenu = memo(function ContextMenu({
  ctxMenu,
  setCtxMenu,
  duplicateNote,
  // Copy text: the note as its Markdown (BoojyNotes.copyNoteText).
  copyNoteText,
  deleteNote,
  deleteFolder,
  duplicateFolder,
  createNote,
  createFolder,
  setRenamingFolder,
  onRenameNote,
  selectedNotes,
  bulkDeleteNotes,
  // Opens the Move to… picker for `subject` ({ kind: "notes", ids } or
  // { kind: "folder", path }) at this menu's anchor; the menu closes first.
  onMoveTo,
  // A file that is not a note (a PDF, an attachment), by its vault path.
  openFile,
  revealFile,
  trashFile,
  // The file shown in the note's place: its ··· actions
  // ({ openDefault, reveal, copyPath, copyPageLink | null, trash }).
  viewedFile,
  // Version History (desktop): the ··· menu becomes the note's past in place.
  onVersionHistory,
  wordCount,
  // The Markdown view: whether it is on, and the one switch (EditorArea's).
  sourceView,
  onToggleSourceView,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const { setSettingsOpen } = useSettings();

  // Each open is a fresh menu, so nothing lit in the last one carries over.
  const opens = useRef(0);
  const openKey = useMemo(() => (ctxMenu ? ++opens.current : opens.current), [ctxMenu]);

  // A right-click, or the header's ···, is a point anchor: the menu opens at
  // it where possible and flips/clamps into the viewport otherwise. A row's
  // ··· hands a rectangle (`anchor`, the row with the gap either side), so a
  // flipped menu sits above the row rather than over it. The Move
  // to… picker opens at the same anchor once this menu has closed.
  const anchor = useMemo(
    () =>
      ctxMenu
        ? (ctxMenu.anchor ?? {
            top: ctxMenu.y,
            bottom: ctxMenu.y,
            left: ctxMenu.x,
            right: ctxMenu.x,
          })
        : null,
    [ctxMenu],
  );
  if (!ctxMenu) return null;

  // The editor header's ··· is the active note's, never the sidebar's
  // selection: a multi-select made in the sidebar must not redirect an action
  // taken from the note on screen. It is the one menu that carries Settings,
  // and it opens with no active note at all, carrying Settings alone.
  const isHeader = ctxMenu.type === "header";
  const isBulk = ctxMenu.type === "note" && selectedNotes.size > 1;

  // Every item closes the menu and then acts. Both are state updates in one
  // event, so they render together whichever comes first.
  const run = (fn) => () => {
    setCtxMenu(null);
    fn?.();
  };

  // Move to… opens the picker where this menu stood: the one
  // route to a destination without dragging, and with the sidebar hidden the
  // only one. It sits after Duplicate in every menu, between what the thing
  // is and what removes it.
  const moveItem = (subject) => ({
    label: "Move to…",
    icon: <MoveToIcon />,
    action: run(() => onMoveTo?.(subject, anchor)),
  });

  // A note's menu (Copy before Duplicate, as in the grip's menu): what acts
  // on the note, then how it is seen, then Settings, then Delete alone at the foot, each group under
  // a rule. The labels are short because the menu is the note's. The keys are
  // shown only in the header's menu, the open note's, which is what they act
  // on; a sidebar row's menu may be another note's.
  const noteItems = (id, keys = false) => [
    {
      label: "Rename",
      icon: <PencilIcon />,
      action: () => {
        // Inline in the sidebar row (BoojyNotes.startNoteRename);
        // falls back to the editor title if the sidebar is hidden.
        onRenameNote(id);
        setCtxMenu(null);
      },
    },
    ...(copyNoteText
      ? [
          {
            label: "Copy",
            icon: <ClipboardIcon />,
            hint: keys ? shortcutLabel({ key: "C", shift: true }) : undefined,
            action: run(() => copyNoteText(id)),
          },
        ]
      : []),
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      hint: keys ? shortcutLabel({ key: "D", shift: true }) : undefined,
      action: run(() => duplicateNote(id)),
    },
    moveItem({ kind: "notes", ids: [id] }),
  ];

  const deleteItem = (id) => ({
    label: "Delete",
    icon: <TrashIcon />,
    rule: true,
    action: run(() => deleteNote(id)),
    danger: true,
  });

  // Version History opens the header's second group, how the note is seen.
  const versionItem = onVersionHistory
    ? {
        label: "Version History",
        icon: <HistoryIcon />,
        // The Mac's key only: Ctrl+Alt+S elsewhere is Go to Sidebar (useAppKeyboard).
        hint: isMac ? "⌥⌘S" : undefined,
        rule: true,
        action: run(onVersionHistory),
      }
    : null;

  const settingsItem = {
    label: "Settings",
    hint: shortcutLabel({ key: "," }),
    // The cog is what sets it apart from the note's own items; a rule above
    // it as well would cut a six-row menu into three compartments.
    icon: <SettingsIcon />,
    action: run(() => setSettingsOpen(true)),
  };

  // The view item says what it will do, as View's Hide/Show Sidebar does: a
  // view is switched, where a format is checked. Under a rule of
  // its own, since it acts on how the note is shown, not on the note.
  const viewItem = {
    label: sourceView ? "Show Formatted" : "Show Markdown",
    icon: sourceView ? <FormattedViewIcon /> : <SourceViewIcon size={16} />,
    hint: shortcutLabel({ key: "/" }),
    rule: true,
    action: run(onToggleSourceView),
  };

  // A file that is not a note: open it in its own app, find it, or remove it.
  // Nothing renames or moves it here (an attachment renamed would break the
  // notes that embed it, since a rename rewrites no links).
  const fileItems = (path) => [
    {
      label: "Open in Default App",
      icon: <OpenLinkIcon />,
      action: run(() => openFile?.(path)),
    },
    {
      label: SHOW_IN_FOLDER_LABEL,
      icon: <RevealIcon />,
      action: run(() => revealFile?.(path)),
    },
    {
      label: "Delete",
      icon: <TrashIcon />,
      rule: true,
      action: run(() => trashFile?.(path)),
      danger: true,
    },
  ];

  // ··· on a file shown in the note's place: its own app first, since that
  // is what the viewer stands in for, then where it is, then the copies (a
  // PDF's page link among them), and the Trash last, as a note's Delete is.
  const viewedItems = (v) => [
    { label: "Open in Default App", icon: <OpenLinkIcon />, action: run(v.openDefault) },
    { label: SHOW_IN_FOLDER_LABEL, icon: <RevealIcon />, action: run(v.reveal) },
    { label: "Copy Path", icon: <CopyIcon />, rule: true, action: run(v.copyPath) },
    ...(v.copyPageLink
      ? [{ label: "Copy Link to This Page", icon: <LinkIcon />, action: run(v.copyPageLink) }]
      : []),
    ...(v.linkInNote
      ? [
          {
            label: `Link Page in “${v.linkNoteName}”`,
            icon: <OpenNoteIcon />,
            hint: LINK_PAGE_KEY,
            action: run(() => v.linkInNote(v.page)),
          },
        ]
      : []),
    { label: "Delete", icon: <TrashIcon />, rule: true, action: run(v.trash), danger: true },
  ];

  // The phone's note screen has no New note of its own (Home has it), so the
  // note's menu starts with one: two taps from writing to a new note.
  const phoneNewNote = isPhone
    ? [
        {
          label: "New note",
          icon: <NewNoteIcon />,
          action: run(() => createNote(null)),
        },
      ]
    : [];
  const items = isHeader
    ? ctxMenu.id
      ? [
          ...phoneNewNote,
          ...noteItems(ctxMenu.id, true).map((item, i) =>
            i === 0 && isPhone ? { ...item, rule: true } : item,
          ),
          ...(versionItem ? [versionItem, { ...viewItem, rule: false }] : [viewItem]),
          { ...settingsItem, rule: true },
          deleteItem(ctxMenu.id),
        ]
      : [settingsItem]
    : ctxMenu.type === "note" && isBulk
      ? [
          // The bulk menu: Move first, since it is what a selection is
          // usually made for, and the one destructive item last, as in the
          // single-note menu. The picker ticks the folder the notes share, or
          // nothing when they are spread over several.
          moveItem({ kind: "notes", ids: [...selectedNotes] }),
          {
            label: `Delete ${selectedNotes.size} notes`,
            icon: <TrashIcon />,
            action: run(() => bulkDeleteNotes([...selectedNotes])),
            danger: true,
          },
        ]
      : ctxMenu.type === "note"
        ? [...noteItems(ctxMenu.id), deleteItem(ctxMenu.id)]
        : ctxMenu.type === "file"
          ? fileItems(ctxMenu.id)
          : ctxMenu.type === "viewed-file" && viewedFile
            ? viewedItems(viewedFile)
            : [
                // Five items, each with its glyph, and no rule: the menu opens
                // from the folder's own row, so the anchoring already says
                // "here". Duplicate and Delete keep their noun, because each
                // takes the whole tree, notes and other files alike. The glyphs
                // are the ones the same actions already wear elsewhere.
                {
                  label: "New note",
                  icon: <NewNoteIcon />,
                  action: run(() => createNote(ctxMenu.id)),
                },
                {
                  label: "New folder",
                  icon: <NewFolderIcon />,
                  action: run(() => createFolder(ctxMenu.id)),
                },
                {
                  label: "Rename",
                  icon: <PencilIcon />,
                  action: run(() => setRenamingFolder(ctxMenu.id)),
                },
                // The phone's vault cannot copy a folder yet: offered there, it only failed.
                ...(isPhone
                  ? []
                  : [
                      {
                        label: "Duplicate folder",
                        icon: <CopyIcon />,
                        action: run(() => duplicateFolder(ctxMenu.id)),
                      },
                    ]),
                moveItem({ kind: "folder", path: ctxMenu.id }),
                {
                  label: "Delete folder",
                  icon: <TrashIcon />,
                  action: run(() => deleteFolder(ctxMenu.id)),
                  danger: true,
                },
              ];

  return (
    <Menu
      key={openKey}
      label={isHeader ? (ctxMenu.id ? "Note actions" : "App options") : "Context menu"}
      idPrefix="ctx-item"
      anchor={anchor}
      minWidth={160}
      onClose={() => setCtxMenu(null)}
      items={items}
      footer={
        isHeader &&
        ctxMenu.id &&
        wordCount != null && (
          <>
            <MenuRule />
            {/* The note's length, at the foot of its own menu (Notion's place
                for it): one muted line, not an item, shown only with a note
                open. The one desktop surface that costs no pixels at rest. */}
            <div
              data-testid="note-stats"
              style={{
                padding: "5px 10px 3px",
                fontSize: 11,
                color: TEXT.muted,
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {noteStatsLabel(wordCount)}
            </div>
          </>
        )
      }
    />
  );
});

export default ContextMenu;
