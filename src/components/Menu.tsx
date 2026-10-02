import {
  Fragment,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type Theme, useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useExitGhost } from "../hooks/useExitGhost";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { cssZoom } from "../utils/domHelpers";
import { CheckIcon, ChevronRightIcon } from "./Icons";

/** A viewport rect a menu hangs from: a button's, a row's, or a point's. */
export interface MenuAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Muted text on the right: the item's key, or why it is disabled. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** A rule above this item: the start of a group. */
  rule?: boolean;
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  /** A radio's or checkbox's state; shown as the tick unless the menu says not. */
  checked?: boolean;
  testId?: string;
  /** Runs on a click, Enter or Space; the menu closes itself when it should. */
  action?: () => void;
  /** Rows hung beside this one, opened on hover, → or Enter; ← or Escape comes back. */
  submenu?: MenuItem[];
}

/** Air between a menu and its submenu. */
const SUBMENU_GAP = 4;
const MODIFIER_KEYS = ["Shift", "Meta", "Control", "Alt"];

/** Every menu's ground: the elevated surface with the divider hairline. */
export const menuSurface = (theme: Theme) => ({
  position: "fixed" as const,
  zIndex: Z.CONTEXT_MENU,
  background: theme.BG.elevated,
  border: `1px solid ${theme.BG.divider}`,
  borderRadius: MENU_RADIUS,
  padding: MENU_PAD,
  boxShadow: theme.modalShadow,
  outline: "none",
});

/** The rule between groups: its own line between the pills, inset like them. */
export function MenuRule() {
  const { theme } = useTheme();
  return (
    <div role="separator" style={{ height: 1, background: theme.BG.divider, margin: "4px 6px" }} />
  );
}

interface MenuProps {
  items: MenuItem[];
  /** The menu's accessible name. */
  label: string;
  /** Rows are `${idPrefix}-${index}`, the active one named by aria-activedescendant. */
  idPrefix: string;
  anchor: MenuAnchor;
  gapY?: number;
  /** `end`: the menu's right edge meets the anchor's (a control at a right edge). */
  align?: "start" | "end";
  onClose: () => void;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  testId?: string;
  /** A keyboard-opened menu starts on a row, as its first key would put it. */
  initialActive?: number;
  /** False where something else on screen already says which is chosen. */
  ticks?: boolean;
  checkTestId?: string;
  /** Above the rows, never a row: what the menu acts on. */
  header?: ReactNode;
  /** Under the rows, never a row: a muted line of information. */
  footer?: ReactNode;
  /**
   * False for a menu over a selection: the editor keeps focus, so the
   * selection stays the ordinary blue (with focus in a menu it goes inactive),
   * and every key goes to the menu, read in document capture before the
   * editor and the shell see it.
   */
  takesFocus?: boolean;
  /** Read before the rows' keys: true when it took the key (a shortcut a row shows). */
  onKey?: (e: KeyboardEvent) => boolean;
  /** A press in the menu keeps the selected blocks selected (`data-selection-surface`). */
  selectionSurface?: boolean;
}

/**
 * Every menu that takes focus: one surface, one row grammar, one placement,
 * one rule for keys.
 *
 * - **It portals to `body`**, so no transformed ancestor contains it, and its
 *   presses stop at its own root: a portal leaves the DOM but not the React
 *   tree, and a press in the menu is not a press in the row, block or editor
 *   that opened it.
 * - **A press outside closes it** (the backdrop), and so does a right-click.
 * - **Placement** is `useMenuPosition` under the anchor, divided by the UI
 *   scale (`cssZoom`): measured rects arrive multiplied by the `zoom` on
 *   `<html>`, and a `top`/`left` on a fixed element is multiplied again.
 * - **Keys** are `useMenuKeys`, read on the menu's own element and stopped
 *   there, so the editor beneath never sees one the menu took. Focus is
 *   parked on the menu a frame after it opens (`useFocusTrap`, on the
 *   container so a pointer-opened menu paints no ring); a key landing before
 *   then is read from the document instead. A menu that never takes focus
 *   (`takesFocus={false}`) reads every key in document capture instead.
 * - **The highlight is state alone**: the pointer's row or the arrows', set
 *   on real movement and cleared when the pointer leaves, never a style
 *   written by hand, so Enter always chooses the row that is lit.
 * - **A submenu** is its own surface beside its row, its first row level with
 *   it, flipped left when the right has no room; it leaves with the menu.
 */
export default function Menu({
  items,
  label,
  idPrefix,
  anchor,
  gapY,
  align,
  onClose,
  minWidth,
  maxWidth,
  className,
  testId,
  initialActive = -1,
  ticks = true,
  checkTestId,
  header,
  footer,
  takesFocus = true,
  onKey,
  selectionSurface,
}: MenuProps) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT, SEMANTIC } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialActive);
  // The row whose submenu is open, and the submenu's lit row.
  const [subOf, setSubOf] = useState(-1);
  const [subActive, setSubActive] = useState(-1);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
  useFocusTrap(menuRef as RefObject<HTMLElement>, takesFocus, "container");
  useExitGhost(menuRef);
  useExitGhost(subRef, subOf >= 0);
  const pos = useMenuPosition(menuRef, true, anchor, { gapY, align });
  const zoom = cssZoom(document.documentElement);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const sub = items[subOf]?.submenu ?? [];
  const subRows = useRef(sub);
  subRows.current = sub;
  const openSub = (i: number, keyboard: boolean) => {
    setSubOf(i);
    const chosen = itemsRef.current[i]?.submenu?.findIndex((r) => r.checked) ?? -1;
    setSubActive(keyboard ? Math.max(0, chosen) : -1);
  };
  const choose = (item: MenuItem | undefined, i: number, keyboard: boolean) => {
    if (!item || item.disabled) return;
    if (item.submenu) openSub(i, keyboard);
    else item.action?.();
  };
  const menuKeys = useMenuKeys({
    rows: () => itemsRef.current,
    active,
    setActive,
    choose: (i) => choose(itemsRef.current[i], i, true),
    close: onClose,
  });
  const subKeys = useMenuKeys({
    rows: () => subRows.current,
    active: subActive,
    setActive: setSubActive,
    choose: (i) => subRows.current[i]?.action?.(),
    close: () => setSubOf(-1),
  });
  const keys = (e: KeyboardEvent): boolean => {
    if (onKey?.(e)) return true;
    if (subOf >= 0) {
      if (e.key !== "ArrowLeft") return subKeys(e);
      setSubOf(-1);
      return true;
    }
    if (e.key === "ArrowRight" && itemsRef.current[active]?.submenu) {
      openSub(active, true);
      return true;
    }
    return menuKeys(e);
  };
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (takesFocus) {
        // Before focus reaches the menu, the key lands wherever focus still is.
        if (menuRef.current?.contains(e.target as Node)) return;
        if (keysRef.current(e)) e.preventDefault();
        return;
      }
      // A bare modifier is the start of a shortcut, not a key for the menu.
      if (MODIFIER_KEYS.includes(e.key)) return;
      keysRef.current(e);
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, !takesFocus);
    return () => document.removeEventListener("keydown", onKey, !takesFocus);
  }, [takesFocus]);

  // The submenu's first row level with the row that opened it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-placed when the menu itself moves
  useLayoutEffect(() => {
    const row = subOf >= 0 && document.getElementById(`${idPrefix}-${subOf}`);
    if (!row || !menuRef.current || !subRef.current) {
      setSubPos(null);
      return;
    }
    const menu = menuRef.current.getBoundingClientRect();
    const box = subRef.current.getBoundingClientRect();
    const right = menu.right + SUBMENU_GAP;
    const left =
      right + box.width <= window.innerWidth ? right : menu.left - SUBMENU_GAP - box.width;
    const top = Math.max(
      SUBMENU_GAP,
      Math.min(
        row.getBoundingClientRect().top - MENU_PAD - 1,
        window.innerHeight - SUBMENU_GAP - box.height,
      ),
    );
    setSubPos({ left, top });
  }, [subOf, idPrefix, pos?.left, pos?.top]);

  const rows = (list: MenuItem[], lit: number, setLit: typeof setActive, prefix: string) =>
    list.map((item, i) => {
      const role = item.role ?? "menuitem";
      const inMain = list === items;
      return (
        <Fragment key={`${i}:${item.label}`}>
          {item.rule && i > 0 && <MenuRule />}
          <button
            id={`${prefix}-${i}`}
            type="button"
            role={role}
            aria-checked={role === "menuitem" ? undefined : !!item.checked}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.submenu ? "menu" : undefined}
            aria-expanded={item.submenu ? subOf === i : undefined}
            data-testid={item.testId}
            // A press keeps focus where it is, on the menu or the editor.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(item, i, false)}
            onMouseMove={() => {
              if (!item.disabled && lit !== i) setLit(i);
              if (!inMain) return;
              if (item.submenu && subOf !== i) openSub(i, false);
              if (!item.submenu && subOf >= 0) setSubOf(-1);
            }}
            onMouseLeave={() => setLit((a) => (a === i ? -1 : a))}
            style={{
              width: "100%",
              background: i === lit || (inMain && subOf === i) ? BG.hover : "none",
              // Every edge set, or Chromium's own outset button border
              // shows on the one left out.
              border: 0,
              borderRadius: MENU_ROW_RADIUS,
              padding: "7px 10px",
              cursor: item.disabled ? "default" : "pointer",
              // The glyph takes the row's ink, so Delete's goes red with it.
              color: item.disabled ? TEXT.muted : item.danger ? SEMANTIC.error : TEXT.primary,
              fontSize: 12.5,
              fontFamily: "inherit",
              textAlign: "left",
              transition: "background var(--motion-fast)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {item.icon && (
              <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
                {item.icon}
              </span>
            )}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </span>
            {item.hint && (
              <span style={{ color: TEXT.muted, fontSize: 12, marginLeft: 16, flexShrink: 0 }}>
                {item.hint}
              </span>
            )}
            {item.submenu && (
              <span aria-hidden="true" style={{ display: "flex", color: TEXT.muted }}>
                <ChevronRightIcon />
              </span>
            )}
            {/* The chosen item's mark: a check in the mark colour. */}
            {ticks && item.checked && (
              <span
                aria-hidden="true"
                data-testid={checkTestId}
                style={{ display: "flex", flexShrink: 0, color: ACCENT.primary }}
              >
                <CheckIcon />
              </span>
            )}
          </button>
        </Fragment>
      );
    });

  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const close = (e: SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  return createPortal(
    <div
      style={{ display: "contents" }}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
    >
      <div
        onMouseDown={close}
        onContextMenu={close}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuRef}
        className={["motion-pop", align === "end" && "motion-from-end", className]
          .filter(Boolean)
          .join(" ")}
        role="menu"
        aria-label={label}
        aria-activedescendant={active >= 0 ? `${idPrefix}-${active}` : undefined}
        tabIndex={takesFocus ? -1 : undefined}
        data-testid={testId}
        data-selection-surface={selectionSurface || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (!keys(e.nativeEvent)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          ...menuSurface(theme),
          top: (pos?.top ?? anchor.bottom + (gapY ?? 0)) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          minWidth,
          maxWidth,
        }}
      >
        {header}
        {rows(items, active, setActive, idPrefix)}
        {footer}
      </div>
      {subOf >= 0 && (
        <div
          ref={subRef}
          className="motion-pop"
          role="menu"
          aria-label={items[subOf]?.label}
          aria-activedescendant={subActive >= 0 ? `${idPrefix}-sub-${subActive}` : undefined}
          data-selection-surface={selectionSurface || undefined}
          onMouseDown={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            ...menuSurface(theme),
            top: (subPos?.top ?? 0) / zoom,
            left: (subPos?.left ?? 0) / zoom,
            visibility: subPos ? "visible" : "hidden",
            minWidth: 180,
          }}
        >
          {rows(sub, subActive, setSubActive, `${idPrefix}-sub`)}
        </div>
      )}
    </div>,
    document.body,
  );
}
