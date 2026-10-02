import {
  Fragment,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
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
import { CheckIcon } from "./Icons";

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
  action: () => void;
}

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
  /** Under the rows, never a row: a muted line of information. */
  footer?: ReactNode;
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
 *   then is read from the document instead.
 * - **The highlight is state alone**: the pointer's row or the arrows', set
 *   on real movement and cleared when the pointer leaves, never a style
 *   written by hand, so Enter always chooses the row that is lit.
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
  footer,
}: MenuProps) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT, SEMANTIC } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialActive);
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");
  useExitGhost(menuRef);
  const pos = useMenuPosition(menuRef, true, anchor, { gapY, align });
  const zoom = cssZoom(document.documentElement);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const menuKeys = useMenuKeys({
    rows: () => itemsRef.current,
    active,
    setActive,
    choose: (i) => itemsRef.current[i]?.action(),
    close: onClose,
  });
  const keysRef = useRef(menuKeys);
  keysRef.current = menuKeys;
  // Before focus reaches the menu, the key lands wherever focus still is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (keysRef.current(e)) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
        tabIndex={-1}
        data-testid={testId}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (!menuKeys(e)) return;
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
        {items.map((item, i) => {
          const role = item.role ?? "menuitem";
          return (
            <Fragment key={`${i}:${item.label}`}>
              {item.rule && i > 0 && <MenuRule />}
              <button
                id={`${idPrefix}-${i}`}
                type="button"
                role={role}
                aria-checked={role === "menuitem" ? undefined : !!item.checked}
                aria-disabled={item.disabled || undefined}
                data-testid={item.testId}
                // A press keeps focus where it is, on the menu.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!item.disabled) item.action();
                }}
                onMouseMove={() => {
                  if (!item.disabled && active !== i) setActive(i);
                }}
                onMouseLeave={() => setActive((a) => (a === i ? -1 : a))}
                style={{
                  width: "100%",
                  background: i === active ? BG.hover : "none",
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
        })}
        {footer}
      </div>
    </div>,
    document.body,
  );
}
