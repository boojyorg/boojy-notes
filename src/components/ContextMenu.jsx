import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { CopyIcon, PencilIcon, TrashIcon } from "./Icons";
import { useSettings } from "../context/SettingsContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { isElectronMac } from "../utils/platform";

const hBg = (el, c) => {
  el.style.background = c;
};

const ContextMenu = memo(function ContextMenu({
  ctxMenu,
  setCtxMenu,
  duplicateNote,
  deleteNote,
  deleteFolder,
  createNote,
  createFolder,
  setRenamingFolder,
  onRenameNote,
  onRevealFolder,
  selectedNotes,
  selectedCount,
  bulkDeleteNotes,
  bulkMoveNotes,
  folderList,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  const { setSettingsOpen } = useSettings();

  const [moveSubmenu, setMoveSubmenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemsRef = useRef([]);
  const menuContainerRef = useRef(null);
  // "container" so a pointer-opened menu doesn't paint a :focus-visible ring
  // on its first item (Chromium treats script focus as focus-visible).
  // Keyboard Tab/arrows still move real focus and indicate normally.
  useFocusTrap(menuContainerRef, !!ctxMenu, "container");

  // The click position is a point anchor: the menu opens at it where possible
  // and flips/clamps into the viewport otherwise (e.g. the note-actions ···
  // button in the top-right corner). Submenu growth re-measures via reflowKey.
  const anchor = useMemo(
    () =>
      ctxMenu ? { top: ctxMenu.y, bottom: ctxMenu.y, left: ctxMenu.x, right: ctxMenu.x } : null,
    [ctxMenu],
  );
  const pos = useMenuPosition(menuContainerRef, !!ctxMenu, anchor, { reflowKey: moveSubmenu });

  // Keyboard navigation — hooks must be above early return
  const handleKeyDown = useCallback(
    (e) => {
      const items = itemsRef.current;
      if (!items.length || e.defaultPrevented) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const idx = activeIndex;
        if (idx >= 0 && idx < items.length) {
          items[idx].action();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setCtxMenu(null);
      }
    },
    [activeIndex, setCtxMenu],
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
    // Under a rule: the app's own business, not this note's.
    separator: true,
    action: () => {
      setCtxMenu(null);
      setSettingsOpen(true);
    },
  };

  const items = isHeader
    ? [...(ctxMenu.id ? noteItems(ctxMenu.id) : []), settingsItem]
    : ctxMenu.type === "note" && isBulk
      ? [
          {
            label: `Delete ${selectedCount} notes`,
            action: () => {
              bulkDeleteNotes([...selectedNotes]);
              setCtxMenu(null);
            },
            danger: true,
          },
          {
            label: "Move to...",
            action: () => setMoveSubmenu((v) => !v),
            submenu: true,
          },
          {
            label: "Move to root",
            action: () => {
              bulkMoveNotes([...selectedNotes], null);
              setCtxMenu(null);
            },
          },
        ]
      : ctxMenu.type === "note"
        ? noteItems(ctxMenu.id)
        : [
            {
              label: "New note here",
              action: () => {
                createNote(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            {
              label: "New folder inside",
              action: () => {
                createFolder(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            {
              label: "Rename",
              action: () => {
                setRenamingFolder(ctxMenu.id);
                setCtxMenu(null);
              },
            },
            // Folders are directories, so the file manager can show one; the
            // item is desktop-only because web folders exist only in memory.
            ...(onRevealFolder
              ? [
                  {
                    label: isElectronMac ? "Reveal in Finder" : "Show in folder",
                    action: () => {
                      onRevealFolder(ctxMenu.id);
                      setCtxMenu(null);
                    },
                  },
                ]
              : []),
            {
              label: "Delete folder",
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
          top: pos?.top ?? ctxMenu.y,
          left: pos?.left ?? ctxMenu.x,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          // All-round padding insets the item pills from the menu edge so
          // their rounded hover reads as a pill, not an edge-to-edge bar.
          padding: 4,
          minWidth: 160,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, index) => (
          <button
            key={item.label}
            id={`ctx-item-${index}`}
            role="menuitem"
            onClick={item.action}
            onMouseEnter={(e) => {
              setActiveIndex(index);
              hBg(e.currentTarget, BG.hover);
            }}
            onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
            style={{
              width: "100%",
              background: index === activeIndex ? BG.hover : "none",
              border: "none",
              // A separator is a rule above the item, drawn in the menu's own
              // divider ink and spaced off the items either side of it.
              borderTop: item.separator ? `1px solid ${BG.divider}` : undefined,
              borderRadius: 6,
              marginTop: item.separator ? 4 : undefined,
              // 10px + the menu's 4px inset keeps the text 14px off the edge.
              padding: "7px 10px",
              // After the shorthand, so the separator's own top air wins.
              paddingTop: item.separator ? 11 : undefined,
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
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {item.icon}
              {item.label}
            </span>
            {item.submenu && <span style={{ fontSize: 10, marginLeft: 8 }}>▸</span>}
          </button>
        ))}
        {moveSubmenu && isBulk && folderList && folderList.length > 0 && (
          <div
            style={{
              borderTop: `1px solid ${BG.divider}`,
              padding: "4px 0",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {folderList.map((fp) => (
              <button
                key={fp}
                onClick={() => {
                  bulkMoveNotes([...selectedNotes], fp);
                  setCtxMenu(null);
                }}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px 6px 18px",
                  cursor: "pointer",
                  color: TEXT.primary,
                  fontSize: 12,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
                onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              >
                {fp}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
});

export default ContextMenu;
