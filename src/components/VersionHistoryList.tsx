import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useExitGhost } from "../hooks/useExitGhost";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { useTheme } from "../hooks/useTheme";
import { type VersionHistoryState, versionLabel } from "../hooks/useVersionHistory";
import type { HistoryVersion } from "../types/global";
import { cssZoom } from "../utils/domHelpers";
import { versionMoment, versionTime } from "../utils/versionTime";
import { HistoryIcon, PencilIcon, RestoreIcon, TrashIcon } from "./Icons";
import Menu, { type MenuAnchor, MenuRule } from "./Menu";
import RenameField from "./RenameField";
import RowAction from "./RowAction";
import { fromTouch } from "../utils/touch";

interface Props {
  state: VersionHistoryState;
  hour12: boolean | undefined;
  /** When the note itself last changed, for the Now row. */
  editedAt: number | null;
  select: (id: string | null) => void;
  restore: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  setOff: (off: boolean) => void;
  /** Hide the list and keep the version on screen (a press elsewhere). */
  hide: () => void;
  /** Back to Now: Escape. */
  close: () => void;
  /** Typing while a version is on screen. */
  onTypeIntoPast: () => void;
}

const ROW_H = 30;
const WIDTH = 320;
const MAX_ROWS = 13;
const VERSION_LIST_ID = "version-history-list";

/**
 * Version History's list: the ··· menu turned into the note's past, in the
 * same place. One line a row: a dot (teal save point, grey ring Autosave, teal
 * ring Now), what it is, and when, right-aligned. Arrow keys show each version
 * in the note; Enter restores, F2 names, Backspace deletes, Escape is Now. The
 * row under the pointer offers restore and delete; the one on screen offers
 * them when the pointer is elsewhere, so there is only ever one pair.
 */
export default function VersionHistoryList({
  state,
  hour12,
  editedAt,
  select,
  restore,
  rename,
  remove,
  setOff,
  hide,
  close,
  onTypeIntoPast,
}: Props) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useExitGhost(rootRef);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [nowChosen, setNowChosen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; anchor: MenuAnchor } | null>(null);
  const now = Date.now();

  const rows: (HistoryVersion | null)[] = [null, ...(state.off ? [] : state.versions)];
  const selectedIndex = state.selected
    ? rows.findIndex((v) => v?.id === state.selected)
    : nowChosen
      ? 0
      : -1;

  // Under the ···, right-aligned to it. Measured geometry is divided by the
  // UI scale before it becomes a style.
  useLayoutEffect(() => {
    const button = document.querySelector('button[aria-label="Note actions"]');
    if (!button) {
      setPos({ top: 46, right: 12 });
      return;
    }
    const r = button.getBoundingClientRect();
    const z = cssZoom(document.documentElement);
    setPos({ top: (r.bottom + 4) / z, right: (window.innerWidth - r.right) / z });
  }, []);

  // Focus once placed: until then it is hidden, and a hidden list takes no focus.
  const placed = pos !== null;
  useEffect(() => {
    if (placed) listRef.current?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    if (!state.selected) return;
    listRef.current
      ?.querySelector(`[data-version-id="${state.selected}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [state.selected]);

  // A press outside hides the list and keeps the version; in the note (reading,
  // selecting to copy) it keeps the list; on the pill or the ··· it is theirs.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || listRef.current?.parentElement?.contains(t)) return;
      // The note (reading, selecting), the pill and its question, a receipt's
      // Undo and the switch's own question are all part of looking back.
      if (
        t.closest(
          "[data-past-version], [data-past-pill], [data-past-ask], [data-toast-kind], [role=alertdialog], [data-menu-backdrop], [role=menu]",
        )
      )
        return;
      if (t.closest('button[aria-label="Note actions"]')) return;
      setRowMenu(null);
      if (state.selected) hide();
      else close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [state.selected, hide, close]);

  const choose = useCallback(
    (index: number) => {
      const v = rows[index];
      setNowChosen(index === 0);
      setRowMenu(null);
      select(v ? v.id : null);
    },
    [rows, select],
  );

  const startRename = (id: string) => {
    setRowMenu(null);
    setRenaming(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    const last = rows.length - 1;
    const on = state.selected;
    // Nothing chosen yet: the first ↓ is the newest version, not Now.
    if (e.key === "ArrowDown") choose(Math.min(last, selectedIndex < 0 ? 1 : selectedIndex + 1));
    else if (e.key === "ArrowUp") choose(Math.max(0, selectedIndex - 1));
    else if (e.key === "Home") choose(0);
    else if (e.key === "End") choose(last);
    else if (e.key === "Enter" && on) restore(on);
    else if (e.key === "F2" && on) startRename(on);
    else if ((e.key === "Backspace" || e.key === "Delete") && on) remove(on);
    else if (e.key === "Escape") close();
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && on) onTypeIntoPast();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 10px" }}>
      <span style={{ color: TEXT.secondary, display: "flex" }}>
        <HistoryIcon />
      </span>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: TEXT.primary }}>
        Version History
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!state.off}
        aria-label="Keep history for this note"
        onClick={() => setOff(!state.off)}
        style={{
          width: 26,
          height: 15,
          borderRadius: 8,
          border: "none",
          padding: 0,
          position: "relative",
          cursor: "pointer",
          background: state.off ? BG.divider : ACCENT.primary,
          transition: "background var(--motion-fast)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "#FFFFFF",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            transform: state.off ? "none" : "translateX(11px)",
            transition: "transform 0.15s",
          }}
        />
      </button>
    </div>
  );

  const dot = (v: HistoryVersion | null, selected: boolean) => {
    const size = v === null ? 10 : v.kind === "point" ? 8 : 7;
    const style: React.CSSProperties =
      v === null
        ? {
            border: `1.5px solid ${ACCENT.text}`,
            background: `radial-gradient(circle, ${ACCENT.text} 0 1.7px, transparent 2.2px)`,
          }
        : v.kind === "point"
          ? { background: ACCENT.text }
          : { border: `1.5px solid ${selected ? ACCENT.text : TEXT.muted}` };
    return (
      <span style={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <span
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            boxSizing: "border-box",
            display: "block",
            ...style,
          }}
        />
      </span>
    );
  };

  const emptyText = state.off
    ? state.versions.length
      ? `Autosave and save points are off.\n${state.versions.length} saved versions are kept and come back when you turn it on.`
      : "Autosave and save points are off."
    : state.versions.length === 0
      ? "Autosaves appear here as you write."
      : null;

  return (
    <div
      ref={rootRef}
      className="motion-pop motion-from-end"
      data-version-history
      style={{
        position: "fixed",
        top: pos?.top ?? 46,
        right: pos?.right ?? 12,
        width: WIDTH,
        zIndex: Z.CONTEXT_MENU,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: MENU_RADIUS,
        padding: MENU_PAD,
        boxShadow: theme.modalShadow,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {header}
      <div
        id={VERSION_LIST_ID}
        ref={listRef}
        role="listbox"
        aria-label="Versions"
        tabIndex={0}
        aria-activedescendant={
          selectedIndex >= 0 ? `version-${rows[selectedIndex]?.id ?? "now"}` : undefined
        }
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHovered(null)}
        style={{ outline: "none", maxHeight: ROW_H * MAX_ROWS, overflowY: "auto" }}
      >
        {rows.map((v, i) => {
          const id = v?.id ?? "now";
          const selected = i === selectedIndex;
          const showActions =
            v !== null && (hovered ? hovered === id : state.selected === id) && renaming !== id;
          const label = v ? versionLabel(v) : "Now";
          const meta = v
            ? versionTime(v.at, now, hour12)
            : editedAt
              ? versionTime(editedAt, now, hour12)
              : "";
          return (
            <div
              key={id}
              id={`version-${id}`}
              data-version-id={id}
              role="option"
              aria-selected={selected}
              title={v ? versionMoment(v.at, hour12) : undefined}
              onMouseEnter={(e) => {
                if (fromTouch(e)) return;
                setHovered(id);
              }}
              onClick={() => choose(i)}
              onDoubleClick={() => v && startRename(v.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!v) return;
                choose(i);
                const { top, bottom, left, right } = e.currentTarget.getBoundingClientRect();
                setRowMenu({ id: v.id, anchor: { top, bottom, left, right } });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: ROW_H,
                padding: "0 4px 0 8px",
                borderRadius: MENU_ROW_RADIUS,
                cursor: "default",
                background: selected || hovered === id ? BG.hover : "transparent",
              }}
            >
              {dot(v, selected)}
              {renaming === id ? (
                <RenameField
                  name={v?.name ?? ""}
                  placeholder={label}
                  label="Version name"
                  onRename={(value: string) => rename(id, value.trim())}
                  onClose={() => setRenaming(null)}
                  onKeyClose={() => listRef.current?.focus({ preventScroll: true })}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 24,
                    border: "none",
                    outline: "none",
                    borderRadius: 6,
                    padding: "0 6px",
                    font: "inherit",
                    fontSize: 13.5,
                    color: TEXT.primary,
                    background: BG.editor,
                    boxShadow: `0 0 0 1.5px ${ACCENT.text}`,
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: v && v.kind === "auto" && !v.name ? TEXT.muted : TEXT.primary,
                  }}
                >
                  {label}
                </span>
              )}
              {showActions ? (
                <span style={{ display: "flex", gap: 2 }}>
                  <RowAction
                    label="Restore this version"
                    tip="Restore version"
                    shortcut="↵"
                    icon={<RestoreIcon size={14} />}
                    onClick={() => restore(id)}
                  />
                  <RowAction
                    label="Delete this version"
                    tip="Delete version"
                    shortcut="⌫"
                    icon={<TrashIcon />}
                    onClick={() => remove(id)}
                    danger
                  />
                </span>
              ) : (
                renaming !== id && (
                  <span
                    style={{
                      fontSize: 12.5,
                      color: TEXT.muted,
                      whiteSpace: "nowrap",
                      paddingRight: 6,
                    }}
                  >
                    {meta}
                  </span>
                )
              )}
            </div>
          );
        })}
        {emptyText && (
          <div
            style={{
              whiteSpace: "pre-line",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: TEXT.muted,
              padding: "6px 12px 10px 30px",
            }}
          >
            {emptyText}
          </div>
        )}
      </div>
      {/* Clicking a row shows that version: said once, as Recently Deleted's foot does. */}
      {rows.length > 1 && (
        <>
          <MenuRule />
          <div
            data-testid="version-history-hint"
            style={{ padding: "5px 10px 6px", color: TEXT.muted, fontSize: 12.5 }}
          >
            Click a version to view it.
          </div>
        </>
      )}
      {rowMenu && (
        <Menu
          label="Version"
          idPrefix="version-row-item"
          anchor={rowMenu.anchor}
          align="end"
          minWidth={190}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: "Rename",
              hint: "F2",
              icon: <PencilIcon />,
              action: () => startRename(rowMenu.id),
            },
            {
              label: "Restore",
              hint: "↵",
              icon: <RestoreIcon />,
              action: () => {
                setRowMenu(null);
                restore(rowMenu.id);
              },
            },
            {
              label: "Delete",
              hint: "⌫",
              icon: <TrashIcon />,
              rule: true,
              danger: true,
              action: () => {
                setRowMenu(null);
                remove(rowMenu.id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
