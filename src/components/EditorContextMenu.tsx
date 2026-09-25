import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { cssZoom } from "../utils/domHelpers";
import { shortcutLabel } from "./Tooltip";
import {
  CopyIcon,
  CutIcon,
  OpenLinkIcon,
  OpenNoteIcon,
  PasteIcon,
  PencilIcon,
  TidyTableIcon,
  TrashIcon,
  UnlinkIcon,
} from "./Icons";

/** Air between the painted selection and the menu (judged 2026-09-23: 4 read as detached, 0 as touching). */
const MENU_GAP = 2;

/** What was right-clicked, when it was a link. */
export type ContextLinkKind = "external" | "wikilink" | "wikilink-broken";

interface EditorContextMenuProps {
  /**
   * Viewport rect the menu hangs under: the line of the selection (or link)
   * under the pointer, so the menu opens below the words it acts on and
   * left-aligned with them, as a native text menu does; flipped above when
   * there is no room.
   */
  anchor: { top: number; bottom: number; left: number; right: number };
  link: ContextLinkKind | null;
  onOpenLink: () => void;
  onCopyLink: () => void;
  onEditLink: () => void;
  onRemoveLink: () => void;
  /** Cut and Copy act on a selection; with only a caret there is nothing to take. */
  canCutCopy: boolean;
  /** Desktop only: a page cannot read the clipboard from a menu item. */
  canPaste: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  /** Given in a table cell whose columns are not lined up: lines them up. */
  onTidyTable?: () => void;
  /** Given in a table cell: the table's own last item, under a rule. */
  onDeleteTable?: () => void;
  onClose: () => void;
}

interface Item {
  label: string;
  icon: ReactNode;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
  rule?: boolean;
  danger?: boolean;
}

/**
 * The editor's right-click menu (2026-09-23): a link's own actions when the
 * pointer is on a link, then Cut, Copy and Paste with their shortcuts, as
 * Notion's and every native text menu has. Before this a right-click on text
 * did nothing at all (Electron supplies no menu) and a link's menu was a
 * hand-drawn list with no glyphs or keys.
 *
 * In a table cell it is the same menu, with Tidy table (only while its
 * columns are not lined up) and Delete table last under a rule:
 * the table's rows and columns are arranged from its grips (TableHandles),
 * and this is the one pointer path to removing the whole table.
 *
 * The image menu's grammar: portalled to `body`, presses stopped on its own
 * element so they never reach the editor, placement divided by the UI scale.
 * Unlike the image menu it never takes focus (below). A disabled row is muted, is skipped by the arrows
 * and does nothing on a click.
 */
export default function EditorContextMenu({
  anchor,
  link,
  onOpenLink,
  onCopyLink,
  onEditLink,
  onRemoveLink,
  canCutCopy,
  canPaste,
  onCut,
  onCopy,
  onPaste,
  onTidyTable,
  onDeleteTable,
  onClose,
}: EditorContextMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const pos = useMenuPosition(menuRef, true, anchor, { gapY: MENU_GAP }) as {
    top: number;
    left: number;
  } | null;
  const zoom = cssZoom(document.documentElement);

  const items: Item[] = [];
  if (link === "external") {
    items.push(
      { label: "Open link", icon: <OpenLinkIcon />, action: onOpenLink },
      { label: "Copy link", icon: <CopyIcon />, action: onCopyLink },
      { label: "Edit link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  } else if (link === "wikilink") {
    items.push(
      { label: "Open note", icon: <OpenNoteIcon />, action: onOpenLink },
      { label: "Copy note name", icon: <CopyIcon />, action: onCopyLink },
      { label: "Edit link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  } else if (link === "wikilink-broken") {
    // A link that names no note, or two: the picker does the fixing.
    items.push(
      { label: "Fix link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  }
  items.push(
    {
      label: "Cut",
      icon: <CutIcon />,
      action: onCut,
      shortcut: shortcutLabel({ key: "X" }),
      disabled: !canCutCopy,
      rule: items.length > 0,
    },
    {
      label: "Copy",
      icon: <CopyIcon />,
      action: onCopy,
      shortcut: shortcutLabel({ key: "C" }),
      disabled: !canCutCopy,
    },
    {
      label: "Paste",
      icon: <PasteIcon />,
      action: onPaste,
      shortcut: shortcutLabel({ key: "V" }),
      disabled: !canPaste,
    },
  );
  if (onTidyTable) {
    items.push({ label: "Tidy table", icon: <TidyTableIcon />, action: onTidyTable, rule: true });
  }
  if (onDeleteTable) {
    items.push({
      label: "Delete table",
      icon: <TrashIcon />,
      action: onDeleteTable,
      rule: !onTidyTable,
      danger: true,
    });
  }

  const run = (item: Item) => {
    if (item.disabled) return;
    item.action();
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (((from + dir * n) % items.length) + items.length) % items.length;
      if (!items[i].disabled) return i;
    }
    return from;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => step(i === -1 ? (dir === 1 ? -1 : items.length) : i, dir));
    } else if (e.key === "Enter" || e.key === " ") {
      if (activeIndex >= 0) run(items[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };
  // The menu never takes focus: the editor keeps it, so the selection stays
  // the ordinary blue a drag gives (with focus in the menu it went inactive,
  // and a painted highlight over it drew the words twice). Every key goes to
  // the menu while it is open, from a document capture listener that runs
  // before the editor and the shell see the key.
  const keyRef = useRef(handleKeyDown);
  keyRef.current = handleKeyDown;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      keyRef.current(e);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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
          // Closing keeps the editor's focus and selection, as a native menu does.
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
        className="editor-context-menu"
        role="menu"
        aria-label={link ? "Link options" : "Edit"}
        aria-activedescendant={activeIndex >= 0 ? `editor-menu-item-${activeIndex}` : undefined}
        // A press in the menu must not take focus from the editor.
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          outline: "none",
          position: "fixed",
          top: (pos?.top ?? anchor.bottom) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: 200,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, i) => (
          <div key={item.label}>
            {item.rule && <div style={{ height: 1, background: BG.divider, margin: "4px 8px" }} />}
            <button
              id={`editor-menu-item-${i}`}
              role="menuitem"
              type="button"
              aria-disabled={item.disabled || undefined}
              // A press here must not move the editor's selection or focus
              // before the item acts on it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item)}
              onMouseMove={() => {
                if (!item.disabled && activeIndex !== i) setActiveIndex(i);
              }}
              onMouseLeave={() => setActiveIndex((a) => (a === i ? -1 : a))}
              style={{
                width: "100%",
                background: i === activeIndex ? BG.hover : "none",
                border: "none",
                borderRadius: MENU_ROW_RADIUS,
                padding: "7px 10px",
                cursor: item.disabled ? "default" : "pointer",
                color: item.disabled
                  ? TEXT.muted
                  : item.danger
                    ? theme.SEMANTIC.error
                    : TEXT.primary,
                opacity: item.disabled ? 0.6 : 1,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ color: TEXT.muted, fontSize: 12, marginLeft: 16 }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
