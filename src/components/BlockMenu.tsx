import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { SLASH_COMMANDS } from "../constants/data";
import { cssZoom } from "../utils/domHelpers";
import { shortcutLabel } from "./Tooltip";
import {
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  SlashCommandIcon,
  TrashIcon,
  TurnIntoIcon,
} from "./Icons";

/** The kinds Turn into offers, by `/` menu id, in the menu bar's order. */
const TURN_INTO_IDS = ["text", "h1", "h2", "h3", "bullet", "numbered", "checkbox", "blockquote"];
export const TURN_INTO = TURN_INTO_IDS.map((id) => {
  const c = SLASH_COMMANDS.find((cmd) => cmd.id === id);
  if (!c) throw new Error(`no slash command ${id}`);
  return { type: c.type, label: c.label, icon: c.icon };
});
/** The text kinds a block can be turned from (H4–H6 included: they turn into the listed ones). */
export const TURNABLE = new Set([...TURN_INTO.map((k) => k.type), "h4", "h5", "h6"]);

/** A block kind's name, as the `/` menu says it (a paragraph is Text). */
export function kindLabel(type: string): string {
  return SLASH_COMMANDS.find((c) => c.type === type)?.label ?? "Block";
}

/** Air between the grip and the menu, and between the menu and its submenu. */
const MENU_GAP = 4;

interface BlockMenuProps {
  /** Viewport rect of the grip (or where it stands): the menu opens beside it. */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** The selected blocks' types, in order. */
  types: string[];
  onTurnInto: (type: string) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface Item {
  label: string;
  icon: ReactNode;
  action: () => void;
  shortcut?: string;
  submenu?: boolean;
  danger?: boolean;
}

/**
 * The grip's menu (the gutter grip's click, a right-click on it, or Shift+F10
 * on a selection): what is selected, then Turn into, Duplicate, Copy and
 * Delete. The editor right-click menu's grammar: portalled to `body`, never
 * takes focus (the editor keeps it, so the caret and the selection stay
 * put), every key read in document capture while it is open. The keys it
 * shows work while it is open. Turn into opens its kinds to the side, on
 * hover, → or Enter; ← or Escape comes back.
 */
export default function BlockMenu({
  anchor,
  types,
  onTurnInto,
  onDuplicate,
  onCopy,
  onDelete,
  onClose,
}: BlockMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const turnRowRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(-1);
  const [subOpen, setSubOpen] = useState(false);
  const [subActive, setSubActive] = useState(-1);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
  // Beside the grip, never over the block it acts on: to its left, top edges
  // level (Notion's place), or to its right when the margin has no room.
  // Said to positionMenu as a line at the grip's top whose right end is the
  // grip's left side and whose left end is its right side: `align: "end"`
  // puts the menu's right edge on the first, and the flip takes the second.
  const side = {
    top: anchor.top,
    bottom: anchor.top,
    left: anchor.right + MENU_GAP,
    right: anchor.left - MENU_GAP,
  };
  const pos = useMenuPosition(menuRef, true, side, { align: "end" }) as {
    top: number;
    left: number;
  } | null;
  const zoom = cssZoom(document.documentElement);

  const canTurn = types.some((t) => TURNABLE.has(t));
  const same = types.every((t) => t === types[0]) ? types[0] : null;
  const heading = types.length === 1 ? kindLabel(types[0]) : `${types.length} blocks`;
  const currentKind = TURN_INTO.findIndex((k) => k.type === same);

  const openSub = (keyboard: boolean) => {
    setSubOpen(true);
    setSubActive(keyboard ? Math.max(0, currentKind) : -1);
  };

  const items: Item[] = [];
  if (canTurn) {
    items.push({
      label: "Turn into",
      icon: <TurnIntoIcon />,
      action: () => openSub(true),
      submenu: true,
    });
  }
  items.push(
    // Copy before Duplicate, as in the note's ··· menu.
    {
      label: "Copy",
      icon: <ClipboardIcon />,
      action: onCopy,
      shortcut: shortcutLabel({ key: "C" }),
    },
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      action: onDuplicate,
      shortcut: shortcutLabel({ key: "D" }),
    },
    { label: "Delete", icon: <TrashIcon />, action: onDelete, shortcut: "⌫", danger: true },
  );

  const mainKeys = useMenuKeys({
    rows: () => items,
    active,
    setActive,
    choose: (i) => items[i].action(),
    close: onClose,
  });
  const subKeys = useMenuKeys({
    rows: () => TURN_INTO,
    active: subActive,
    setActive: setSubActive,
    choose: (i) => onTurnInto(TURN_INTO[i].type),
    close: () => setSubOpen(false),
  });

  // The shortcuts the rows show, answered while the menu holds the keys.
  const shortcut = (e: KeyboardEvent): (() => void) | null => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyD") return onDuplicate;
    if (mod && !e.shiftKey && !e.altKey && e.code === "KeyC") return onCopy;
    if (!mod && (e.key === "Backspace" || e.key === "Delete")) return onDelete;
    return null;
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const run = shortcut(e);
    if (run) return run();
    if (subOpen) {
      if (e.key === "ArrowLeft") return setSubOpen(false);
      subKeys(e);
      return;
    }
    if (e.key === "ArrowRight" && items[active]?.submenu) return openSub(true);
    mainKeys(e);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A bare modifier is the start of a shortcut, not a key for the menu.
      if (["Shift", "Meta", "Control", "Alt"].includes(e.key)) return;
      keyRef.current(e);
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // The kinds hang beside the menu, their first row level with Turn into;
  // on the left when there is no room on the right.
  useLayoutEffect(() => {
    if (!subOpen || !menuRef.current || !subRef.current || !turnRowRef.current) {
      setSubPos(null);
      return;
    }
    const menu = menuRef.current.getBoundingClientRect();
    const row = turnRowRef.current.getBoundingClientRect();
    const sub = subRef.current.getBoundingClientRect();
    const right = menu.right + MENU_GAP;
    const left = right + sub.width <= window.innerWidth ? right : menu.left - MENU_GAP - sub.width;
    const top = Math.max(
      MENU_GAP,
      Math.min(row.top - MENU_PAD - 1, window.innerHeight - MENU_GAP - sub.height),
    );
    setSubPos({ left, top });
  }, [subOpen, pos?.left, pos?.top]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const surface = {
    position: "fixed" as const,
    zIndex: Z.CONTEXT_MENU,
    background: BG.elevated,
    border: `1px solid ${BG.divider}`,
    borderRadius: MENU_RADIUS,
    padding: MENU_PAD,
    boxShadow: theme.modalShadow,
    animation: "fadeIn 0.1s ease",
    outline: "none",
  };
  const rowStyle = (on: boolean, danger?: boolean) => ({
    width: "100%",
    background: on ? BG.hover : "none",
    border: "none",
    borderRadius: MENU_ROW_RADIUS,
    padding: "7px 10px",
    cursor: "pointer",
    color: danger ? theme.SEMANTIC.error : TEXT.primary,
    fontSize: 12.5,
    fontFamily: "inherit",
    textAlign: "left" as const,
    transition: "background 0.12s",
    display: "flex",
    alignItems: "center",
    gap: 8,
  });

  return createPortal(
    <div
      style={{ display: "contents" }}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuRef}
        className="block-menu"
        // Part of the selection: a press in it keeps the blocks selected.
        data-selection-surface
        role="menu"
        aria-label="Block options"
        aria-activedescendant={active >= 0 ? `block-menu-item-${active}` : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          ...surface,
          top: (pos?.top ?? anchor.top) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          visibility: pos ? "visible" : "hidden",
          minWidth: 200,
        }}
      >
        <div
          aria-hidden="true"
          style={{ padding: "5px 10px 4px", fontSize: 11.5, fontWeight: 500, color: TEXT.muted }}
        >
          {heading}
        </div>
        {items.map((item, i) => (
          <button
            key={item.label}
            ref={item.submenu ? turnRowRef : undefined}
            id={`block-menu-item-${i}`}
            role="menuitem"
            type="button"
            aria-haspopup={item.submenu ? "menu" : undefined}
            aria-expanded={item.submenu ? subOpen : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (item.submenu ? openSub(false) : item.action())}
            onMouseMove={() => {
              if (active !== i) setActive(i);
              if (item.submenu && !subOpen) openSub(false);
              if (!item.submenu && subOpen) setSubOpen(false);
            }}
            style={rowStyle(i === active || (!!item.submenu && subOpen), item.danger)}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: TEXT.muted, fontSize: 12, marginLeft: 16 }}>
                {item.shortcut}
              </span>
            )}
            {item.submenu && (
              <span style={{ color: TEXT.muted, display: "flex" }}>
                <ChevronRightIcon />
              </span>
            )}
          </button>
        ))}
      </div>
      {subOpen && (
        <div
          ref={subRef}
          className="block-menu-kinds"
          data-selection-surface
          role="menu"
          aria-label="Turn into"
          aria-activedescendant={subActive >= 0 ? `block-kind-${subActive}` : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            ...surface,
            top: (subPos?.top ?? 0) / zoom,
            left: (subPos?.left ?? 0) / zoom,
            visibility: subPos ? "visible" : "hidden",
            minWidth: 180,
          }}
        >
          {TURN_INTO.map((kind, i) => (
            <button
              key={kind.type}
              id={`block-kind-${i}`}
              role="menuitemradio"
              aria-checked={i === currentKind}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onTurnInto(kind.type)}
              onMouseMove={() => subActive !== i && setSubActive(i)}
              onMouseLeave={() => setSubActive((a) => (a === i ? -1 : a))}
              style={rowStyle(i === subActive)}
            >
              <SlashCommandIcon name={kind.icon} />
              <span style={{ flex: 1 }}>{kind.label}</span>
              {i === currentKind && (
                <span style={{ color: TEXT.secondary, display: "flex" }}>
                  <CheckIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
