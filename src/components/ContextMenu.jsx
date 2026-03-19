import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useTheme } from "../hooks/useTheme";

const hBg = (el, c) => {
  el.style.background = c;
};

const ContextMenu = memo(function ContextMenu({
  ctxMenu,
  setCtxMenu,
  openNote,
  duplicateNote,
  deleteNote,
  deleteFolder,
  createNote,
  setRenamingFolder,
  restoreNote,
  permanentDeleteNote,
  titleRef,
  onExportPdf,
  onExportDocx,
  onImport,
  selectedNotes,
  selectedCount,
  bulkDeleteNotes,
  bulkMoveNotes,
  folderList,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;

  const [moveSubmenu, setMoveSubmenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemsRef = useRef([]);

  // Keyboard navigation — hooks must be above early return
  const handleKeyDown = useCallback(
    (e) => {
      const items = itemsRef.current;
      if (!items.length) return;
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

  useEffect(() => {
    if (!ctxMenu) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ctxMenu, handleKeyDown]);

  if (!ctxMenu) return null;

  const isBulk = ctxMenu.type === "note" && selectedCount > 1;

  const items =
    ctxMenu.type === "trash"
      ? [
          {
            label: "Restore",
            action: () => {
              restoreNote(ctxMenu.id);
              setCtxMenu(null);
            },
          },
          {
            label: "Delete permanently",
            action: () => {
              permanentDeleteNote(ctxMenu.id);
              setCtxMenu(null);
            },
            danger: true,
          },
        ]
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
          ? [
              {
                label: "Rename",
                action: () => {
                  openNote(ctxMenu.id);
                  setCtxMenu(null);
                  setTimeout(() => {
                    if (titleRef.current) {
                      titleRef.current.focus();
                      const sel = window.getSelection();
                      sel.selectAllChildren(titleRef.current);
                    }
                  }, 60);
                },
              },
              {
                label: "Duplicate",
                action: () => {
                  duplicateNote(ctxMenu.id);
                  setCtxMenu(null);
                },
              },
              ...(onExportPdf
                ? [
                    {
                      label: "Export as PDF",
                      action: () => {
                        onExportPdf(ctxMenu.id);
                        setCtxMenu(null);
                      },
                    },
                  ]
                : []),
              ...(onExportDocx
                ? [
                    {
                      label: "Export as DOCX",
                      action: () => {
                        onExportDocx(ctxMenu.id);
                        setCtxMenu(null);
                      },
                    },
                  ]
                : []),
              {
                label: "Delete",
                action: () => {
                  deleteNote(ctxMenu.id);
                  setCtxMenu(null);
                },
                danger: true,
              },
            ]
          : [
              {
                label: "New note here",
                action: () => {
                  createNote(ctxMenu.id);
                  setCtxMenu(null);
                },
              },
              ...(onImport
                ? [
                    {
                      label: "Import files here",
                      action: () => {
                        onImport(ctxMenu.id);
                        setCtxMenu(null);
                      },
                    },
                  ]
                : []),
              {
                label: "Rename",
                action: () => {
                  setRenamingFolder(ctxMenu.id);
                  setCtxMenu(null);
                },
              },
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
      <div onClick={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 250 }} />
      <div
        role="menu"
        aria-label="Context menu"
        aria-activedescendant={activeIndex >= 0 ? `ctx-item-${activeIndex}` : undefined}
        style={{
          position: "fixed",
          top: ctxMenu.y,
          left: ctxMenu.x,
          zIndex: 300,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: "4px 0",
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
              hBg(e.currentTarget, BG.surface);
            }}
            onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
            style={{
              width: "100%",
              background: index === activeIndex ? BG.surface : "none",
              border: "none",
              padding: "7px 14px",
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
            {item.label}
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
                  padding: "6px 14px 6px 22px",
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
