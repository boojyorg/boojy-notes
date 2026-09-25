import {
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useTheme } from "../hooks/useTheme";
import {
  CopyIcon,
  FormattedViewIcon,
  MoveToIcon,
  NewFolderIcon,
  NewNoteIcon,
  PencilIcon,
  SettingsIcon,
  SourceViewIcon,
  TrashIcon,
} from "./Icons";
import { shortcutLabel } from "./Tooltip";
import { useSettings } from "../context/SettingsContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { cssZoom } from "../utils/domHelpers";

/** The rule between groups, the sidebar menu's own: 1px, inset 6px. */
const MenuRule = ({ color }) => (
  <div role="separator" style={{ height: 1, background: color, margin: "4px 6px" }} />
);

/** `412 words`: the number a note is measured by. Characters were shown too
 *  and dropped (2026-09-16): nobody writes a note to a character limit. */
export const noteStatsLabel = (words) => `${words} word${words === 1 ? "" : "s"}`;

const ContextMenu = memo(function ContextMenu({
  ctxMenu,
  setCtxMenu,
  duplicateNote,
  deleteNote,
  deleteFolder,
  duplicateFolder,
  createNote,
  createFolder,
  setRenamingFolder,
  onRenameNote,
  selectedNotes,
  selectedCount,
  bulkDeleteNotes,
  // Opens the Move to… picker for `subject` ({ kind: "notes", ids } or
  // { kind: "folder", path }) at this menu's anchor; the menu closes first.
  onMoveTo,
  wordCount,
  // The Markdown view: whether it is on, and the one switch (EditorArea's).
  sourceView,
  onToggleSourceView,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  const { setSettingsOpen } = useSettings();

  // The highlighted row, by index: the pointer's row, or the arrows'. -1 is
  // none. The one owner of a row's hover surface (`background` below); no
  // direct style write, so nothing can disagree with it.
  const [activeIndex, setActiveIndex] = useState(-1);
  // This component stays mounted between opens (it renders null when there is
  // no menu), so its state would otherwise carry over: hover Rename, close,
  // and the next row's, folder's or header's menu opened with Rename already
  // lit before the pointer arrived (seen live 2026-09-16). Every open starts
  // with nothing highlighted; a layout effect, so the reset lands before the
  // menu's first paint.
  useLayoutEffect(() => {
    setActiveIndex(-1);
  }, [ctxMenu]);
  const itemsRef = useRef([]);
  const menuContainerRef = useRef(null);
  // "container" so a pointer-opened menu doesn't paint a :focus-visible ring
  // on its first item (Chromium treats script focus as focus-visible).
  // Keyboard Tab/arrows still move real focus and indicate normally.
  useFocusTrap(menuContainerRef, !!ctxMenu, "container");

  // A right-click, or the header's ···, is a point anchor: the menu opens at
  // it where possible and flips/clamps into the viewport otherwise. A row's
  // ··· hands a rectangle (`anchor`, the row with the gap either side), so a
  // flipped menu sits above the row rather than over it (2026-09-16). The Move
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
  const pos = useMenuPosition(menuContainerRef, !!ctxMenu, anchor);
  // The UI scale is CSS zoom on <html>: the pointer's clientX/Y and every
  // measured rect arrive already multiplied by it, and a `top`/`left` written
  // on this fixed element is multiplied again on paint, so the placement is
  // divided by the zoom before it becomes a style (2026-09-16; the folder
  // popup, the grip and the drop marker do the same). Before this the menu
  // opened 50px under and 60px right of the ··· at 125%.
  const zoom = cssZoom(document.documentElement);

  // Keyboard navigation — hooks must be above early return. The rows are
  // built below, after the early return, so the keys read them at the press.
  const menuKeys = useMenuKeys({
    rows: () => itemsRef.current,
    active: activeIndex,
    setActive: setActiveIndex,
    choose: (i) => itemsRef.current[i]?.action(),
    close: () => setCtxMenu(null),
  });
  const handleKeyDown = useCallback(
    (e) => {
      if (itemsRef.current.length && menuKeys(e)) e.preventDefault();
    },
    [menuKeys],
  );

  // On the document, not the window: the app shell's shortcut handler is a
  // window listener registered at startup, so a window listener added when
  // the menu opens would run after it and its preventDefault would come too
  // late (Escape here also closed the overlay sidebar beneath the menu).
  useEffect(() => {
    if (!ctxMenu) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ctxMenu, handleKeyDown]);

  if (!ctxMenu) return null;

  // The editor header's ··· is the active note's, never the sidebar's
  // selection: a multi-select made in the sidebar must not redirect an action
  // taken from the note on screen. It is the one menu that carries Settings,
  // and it opens with no active note at all, carrying Settings alone.
  const isHeader = ctxMenu.type === "header";
  const isBulk = ctxMenu.type === "note" && selectedCount > 1;

  // Move to… opens the picker where this menu stood (2026-09-20): the one
  // route to a destination without dragging, and with the sidebar hidden the
  // only one. It sits after Duplicate in every menu, between what the thing
  // is and what removes it.
  const moveItem = (subject) => ({
    label: "Move to…",
    icon: <MoveToIcon />,
    action: () => {
      setCtxMenu(null);
      onMoveTo?.(subject, anchor);
    },
  });

  const noteItems = (id) => [
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
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      action: () => {
        duplicateNote(id);
        setCtxMenu(null);
      },
    },
    moveItem({ kind: "notes", ids: [id] }),
    {
      label: "Delete",
      icon: <TrashIcon />,
      action: () => {
        deleteNote(id);
        setCtxMenu(null);
      },
      danger: true,
    },
  ];

  const settingsItem = {
    label: "Settings",
    // The cog is what sets it apart from the note's own items; a rule above
    // it as well cut a six-row menu into three compartments (judged live
    // 2026-09-16).
    icon: <SettingsIcon />,
    action: () => {
      setCtxMenu(null);
      setSettingsOpen(true);
    },
  };

  // The view item says what it will do, as View's Hide/Show Sidebar does: a
  // view is switched, where a format is checked (2026-09-24). Under a rule of
  // its own, since it acts on how the note is shown, not on the note.
  const viewItem = {
    label: sourceView ? "Show Formatted" : "Show Markdown",
    icon: sourceView ? <FormattedViewIcon /> : <SourceViewIcon size={16} />,
    shortcut: shortcutLabel({ key: "/" }),
    separator: true,
    action: () => {
      setCtxMenu(null);
      onToggleSourceView?.();
    },
  };

  const items = isHeader
    ? [...(ctxMenu.id ? [...noteItems(ctxMenu.id), viewItem] : []), settingsItem]
    : ctxMenu.type === "note" && isBulk
      ? [
          // The bulk menu: Move first, since it is what a selection is
          // usually made for, and the one destructive item last, as in the
          // single-note menu. The picker ticks the folder the notes share, or
          // nothing when they are spread over several.
          moveItem({ kind: "notes", ids: [...selectedNotes] }),
          {
            label: `Delete ${selectedCount} notes`,
            icon: <TrashIcon />,
            action: () => {
              bulkDeleteNotes([...selectedNotes]);
              setCtxMenu(null);
            },
            danger: true,
          },
        ]
      : ctxMenu.type === "note"
        ? noteItems(ctxMenu.id)
        : [
            // Five items, each with its glyph, and no rule (2026-09-16, Tyr's
            // call): the menu opens from the folder's own row, so "here" and
            // "inside" said what the anchoring already says; Duplicate and
            // Delete keep their noun, because each takes the whole tree, notes
            // and other files alike, unlike the note menu's pair. The glyphs
            // are the ones the same actions already wear: the row's and pill's
            // pen, the Notes row's FolderPlus, the note menu's Pencil, Copy and
            // Trash. Reveal in Finder left the folder menu that day; it is
            // Settings → Storage's now. Duplicate folder arrived 2026-09-17.
            {
              label: "New note",
              icon: <NewNoteIcon />,
              action: () => {
                createNote(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            {
              label: "New folder",
              icon: <NewFolderIcon />,
              action: () => {
                createFolder(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            {
              label: "Rename",
              icon: <PencilIcon />,
              action: () => {
                setRenamingFolder(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            {
              label: "Duplicate folder",
              icon: <CopyIcon />,
              action: () => {
                duplicateFolder(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            moveItem({ kind: "folder", path: ctxMenu.id }),
            {
              label: "Delete folder",
              icon: <TrashIcon />,
              action: () => {
                deleteFolder(ctxMenu.id);
                setCtxMenu(null);
              },
              danger: true,
            },
          ];

  itemsRef.current = items;

  return (
    <>
      <div
        onClick={() => setCtxMenu(null)}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuContainerRef}
        role="menu"
        aria-label={isHeader ? (ctxMenu.id ? "Note actions" : "App options") : "Context menu"}
        aria-activedescendant={activeIndex >= 0 ? `ctx-item-${activeIndex}` : undefined}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "fixed",
          top: (pos?.top ?? ctxMenu.y) / zoom,
          left: (pos?.left ?? ctxMenu.x) / zoom,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          // All-round padding insets the item pills from the menu edge so
          // their rounded hover reads as a pill, not an edge-to-edge bar.
          padding: MENU_PAD,
          minWidth: 160,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {/* A separator is its own rule between the pills, inset like the
                sidebar menu's, never an edge of the button below it: drawn
                as the button's top border it ran the row's full width in the
                menu's own border ink and sat inside the hover pill, whose
                padding then had to fake the gap (2026-09-16). */}
            {item.separator && index > 0 && <MenuRule color={BG.divider} />}
            <button
              id={`ctx-item-${index}`}
              role="menuitem"
              onClick={item.action}
              onMouseEnter={() => setActiveIndex(index)}
              // Leaving clears the index too: it used to clear only the
              // inline background, and any re-render lit the row again.
              onMouseLeave={() => setActiveIndex((i) => (i === index ? -1 : i))}
              style={{
                width: "100%",
                background: index === activeIndex ? BG.hover : "none",
                // Every edge set, or Chromium's own 2px outset button border
                // shows on the one left out (seen 2026-09-14).
                border: 0,
                borderRadius: MENU_ROW_RADIUS,
                // 10px + the menu's 4px inset keeps the text 14px off the edge.
                padding: "7px 10px",
                cursor: "pointer",
                color: item.danger ? SEMANTIC.error : TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {/* Icons inherit the item colour, so Delete's glyph goes red with it. */}
              <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                {item.icon}
                {item.label}
              </span>
              {item.shortcut && (
                <span style={{ color: TEXT.muted, marginLeft: 24 }}>{item.shortcut}</span>
              )}
            </button>
          </Fragment>
        ))}
        {isHeader && ctxMenu.id && wordCount != null && (
          <>
            <MenuRule color={BG.divider} />
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
        )}
      </div>
    </>
  );
});

export default ContextMenu;
