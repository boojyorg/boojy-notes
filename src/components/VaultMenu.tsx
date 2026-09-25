import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import type { VaultView } from "../utils/otherFiles";
import { AttachmentsIcon, CheckIcon, OtherFileIcon, SettingsIcon, VaultIcon } from "./Icons";

/**
 * The storage-location menu, under the sidebar's location name (or ⌘O):
 * which location is open, and what the tree shows besides notes. A switcher
 * only (2026-09-25, Tyr): adding, removing and revealing a location are
 * Settings' (Manage storage locations…), because a location is added rarely
 * and switched often. Each row has its glyph and the Sort menu's grammar: a
 * chosen row carries the check on the right in the mark colour, a missing
 * location is muted and says so. Code calls a location a vault. The file
 * toggles are this location's own (a Drive folder full of PDFs can hide them
 * while another shows them).
 */

export interface VaultMenuEntry {
  path: string;
  name: string;
  current: boolean;
  exists: boolean;
  cloud: boolean;
}

interface VaultMenuProps {
  anchor: { top: number; bottom: number; left: number; right: number };
  vaults: VaultMenuEntry[];
  view: VaultView;
  setView: (next: VaultView) => void;
  onSwitch: (path: string) => void;
  /** Settings, at the storage locations: where one is added, removed or revealed. */
  onManage: () => void;
  onClose: () => void;
  /** Opened by ⌘O: the open vault's row starts active, as a keyboard menu's first row does. */
  fromKeyboard?: boolean;
}

interface Row {
  id: string;
  label: string;
  role: "menuitemradio" | "menuitemcheckbox" | "menuitem";
  icon: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  /** Muted text on the right: the shortcut, or why a row is disabled. */
  trailing?: string;
  /** A rule above this row: the start of a group. */
  separator?: boolean;
  action: () => void;
}

export default function VaultMenu({
  anchor,
  vaults,
  view,
  setView,
  onSwitch,
  onManage,
  onClose,
  fromKeyboard = false,
}: VaultMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const menuAnchor = useMemo(
    () => ({ top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right }),
    [anchor],
  );
  const pos = useMenuPosition(menuRef, true, menuAnchor, { gapY: 4 }) as {
    top: number;
    left: number;
  } | null;

  const rows = useMemo<Row[]>(
    () => [
      ...vaults.map(
        (v): Row => ({
          id: `vault:${v.path}`,
          label: v.name,
          role: "menuitemradio",
          icon: <VaultIcon cloud={v.cloud} missing={!v.exists} />,
          checked: v.current,
          disabled: !v.exists && !v.current,
          trailing: v.exists ? undefined : "Not found",
          action: () => {
            onClose();
            if (!v.current) onSwitch(v.path);
          },
        }),
      ),
      {
        id: "otherFiles",
        label: "Show other files",
        role: "menuitemcheckbox",
        icon: <OtherFileIcon />,
        checked: view.otherFiles,
        separator: true,
        action: () => setView({ ...view, otherFiles: !view.otherFiles }),
      },
      {
        id: "attachments",
        label: "Show attachments",
        role: "menuitemcheckbox",
        icon: <AttachmentsIcon />,
        checked: view.attachments,
        action: () => setView({ ...view, attachments: !view.attachments }),
      },
      {
        id: "manage",
        label: "Manage storage locations…",
        role: "menuitem",
        icon: <SettingsIcon />,
        separator: true,
        action: () => {
          onClose();
          onManage();
        },
      },
    ],
    [vaults, view, setView, onSwitch, onManage, onClose],
  );

  const [activeIndex, setActiveIndex] = useState(() =>
    fromKeyboard
      ? Math.max(
          0,
          vaults.findIndex((v) => v.current),
        )
      : -1,
  );
  // A keyboard-opened menu lets the active row take focus's place; a pointer-
  // opened one parks focus on the container so no row paints a ring.
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");

  const choose = useCallback((i: number) => rows[i]?.action(), [rows]);
  const menuKeys = useMenuKeys({
    rows: () => rows,
    active: activeIndex,
    setActive: setActiveIndex,
    choose,
    close: onClose,
  });
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (menuKeys(e)) e.preventDefault();
    },
    [menuKeys],
  );
  // On the document, as the Sort menu: a window listener added on open would
  // run after the app shell's, too late to claim Escape from it.
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Storage location"
        aria-activedescendant={activeIndex >= 0 ? `vault-item-${activeIndex}` : undefined}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "fixed",
          top: pos?.top ?? anchor.bottom + 4,
          left: pos?.left ?? anchor.left,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: 220,
          maxWidth: 320,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {rows.map((row, index) => {
          const active = index === activeIndex;
          const muted = row.disabled;
          return (
            <div key={row.id}>
              {row.separator && (
                <div
                  role="separator"
                  style={{ height: 1, background: BG.divider, margin: "4px 6px" }}
                />
              )}
              <button
                type="button"
                id={`vault-item-${index}`}
                role={row.role}
                aria-checked={row.role === "menuitem" ? undefined : !!row.checked}
                aria-disabled={row.disabled || undefined}
                data-testid={`vault-menu-${row.id}`}
                onClick={() => {
                  if (!row.disabled) row.action();
                }}
                onMouseEnter={() => {
                  if (!row.disabled) setActiveIndex(index);
                }}
                onMouseLeave={() => setActiveIndex((i) => (i === index ? -1 : i))}
                style={{
                  width: "100%",
                  background: active ? BG.hover : "none",
                  border: 0,
                  borderRadius: MENU_ROW_RADIUS,
                  padding: "7px 10px",
                  cursor: row.disabled ? "default" : "pointer",
                  color: muted ? TEXT.muted : TEXT.primary,
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background 0.12s",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* The glyph in the menu tier's ink, as the Sort menu's. */}
                <span
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    flexShrink: 0,
                    color: muted ? TEXT.muted : TEXT.secondary,
                  }}
                >
                  {row.icon}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </span>
                {row.trailing && (
                  <span style={{ color: TEXT.muted, flexShrink: 0, marginLeft: 12 }}>
                    {row.trailing}
                  </span>
                )}
                {/* The chosen vault and the shown kinds: a check in the mark colour. */}
                {row.checked && (
                  <span
                    aria-hidden="true"
                    style={{ display: "flex", flexShrink: 0, color: ACCENT.primary }}
                  >
                    <CheckIcon />
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
