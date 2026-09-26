import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import type { DeletedNote } from "../hooks/useRecentlyDeleted";
import { useTheme } from "../hooks/useTheme";
import { cssZoom } from "../utils/domHelpers";
import { CloseIcon, RecentlyDeletedIcon, RestoreIcon } from "./Icons";

type Theme = {
  BG: Record<string, string>;
  TEXT: Record<string, string>;
  modalShadow: string;
};

interface Props {
  items: DeletedNote[];
  restore: (id: string) => void;
  purge: (item: DeletedNote) => void;
  onClose: () => void;
}

/**
 * Recently Deleted, opened from its row at the foot of the sidebar: one line a
 * note, `Folder / Name` as the path at the top reads, and no ages (the one line
 * under the list says how long they wait). The row under the pointer, or the
 * one the arrows are on, offers put back and delete for good; Enter and Delete
 * do the same. Escape or a press outside closes it.
 */
export default function RecentlyDeletedMenu({ items, restore, purge, onClose }: Props) {
  const { theme } = useTheme() as { theme: Theme };
  const { BG, TEXT } = theme;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [active, setActive] = useState(-1);
  const [hovered, setHovered] = useState<string | null>(null);

  // Beside the sidebar, its foot level with the row's: measured, then divided
  // by the UI scale before it becomes a style.
  useLayoutEffect(() => {
    const row = document.querySelector('[data-testid="recently-deleted-row"]');
    const z = cssZoom(document.documentElement);
    if (!row) {
      setPos({ left: 248, bottom: 10 });
      return;
    }
    const r = row.getBoundingClientRect();
    setPos({ left: (r.right + 10) / z, bottom: (window.innerHeight - r.bottom) / z });
  }, []);

  useEffect(() => {
    if (pos) ref.current?.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t)) return;
      if (t.closest('[data-testid="recently-deleted-row"], [role=alertdialog]')) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const item = items[active];
    if (e.key === "ArrowDown") setActive((i) => Math.min(items.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && item) restore(item.id);
    else if ((e.key === "Delete" || e.key === "Backspace") && item) purge(item);
    else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const iconButton = (label: string, icon: React.ReactNode, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      style={{
        width: 26,
        height: 24,
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: TEXT.secondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = BG.editor;
        e.currentTarget.style.color = TEXT.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = TEXT.secondary;
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Recently Deleted"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        outline: "none",
        position: "fixed",
        left: pos?.left ?? 248,
        bottom: pos?.bottom ?? 10,
        // As wide as what it holds, no wider (the 30-days line, usually), and
        // never past 320: a longer name is cut with an ellipsis.
        width: "fit-content",
        minWidth: 220,
        maxWidth: 320,
        zIndex: Z.CONTEXT_MENU,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: MENU_RADIUS,
        padding: MENU_PAD,
        boxShadow: theme.modalShadow,
        animation: "fadeIn 0.1s ease",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
        <span style={{ color: TEXT.secondary, display: "flex" }}>
          <RecentlyDeletedIcon />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT.primary }}>
          Recently Deleted
        </span>
      </div>
      <div
        role="listbox"
        aria-label="Deleted notes"
        aria-activedescendant={items[active] ? `deleted-${items[active].id}` : undefined}
        onMouseLeave={() => setHovered(null)}
        style={{ maxHeight: 30 * 10, overflowY: "auto" }}
      >
        {items.map((item, i) => {
          const actions = hovered ? hovered === item.id : i === active;
          return (
            <div
              key={item.id}
              id={`deleted-${item.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setHovered(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 30,
                padding: "0 4px 0 10px",
                borderRadius: MENU_ROW_RADIUS,
                background: i === active || hovered === item.id ? BG.hover : "transparent",
                fontSize: 13.5,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: TEXT.primary,
                }}
              >
                {item.folder && (
                  <span style={{ color: TEXT.secondary }}>{item.folder.split("/").pop()} / </span>
                )}
                {item.name || "Untitled"}
              </span>
              {/* Always there, shown only on the row that offers them: the
                  menu keeps its width when the pointer moves. */}
              {
                <span
                  style={{ display: "flex", gap: 2, visibility: actions ? "visible" : "hidden" }}
                >
                  {iconButton(`Put back “${item.name}”`, <RestoreIcon size={14} />, () =>
                    restore(item.id),
                  )}
                  {iconButton(`Delete “${item.name}” permanently`, <CloseIcon size={14} />, () =>
                    purge(item),
                  )}
                </span>
              }
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ padding: "8px 10px 10px", color: TEXT.muted, fontSize: 13 }}>
            Nothing deleted in the last 30 days.
          </div>
        )}
      </div>
      <div role="separator" style={{ height: 1, background: BG.divider, margin: "4px 6px" }} />
      <div style={{ padding: "5px 10px 6px", color: TEXT.muted, fontSize: 12.5 }}>
        Notes here are deleted after 30 days.
      </div>
    </div>
  );
}
