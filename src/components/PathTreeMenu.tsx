import {
  type CSSProperties,
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
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useNoteData } from "../context/NoteDataContext";
import { useSidebar } from "../context/SidebarContext";
import { Z } from "../constants/zIndex";
import {
  ACTION_RADIUS,
  ROW_INSET,
  SPINE,
  SPINE_ICON,
  TEXT_COL,
  TREE_INDENT,
  TREE_ROW_GAP,
  TREE_ROW_H,
} from "../constants/layout";
import type { SidebarNode } from "../types/notes";
import { parentRowIndex, scopeContents, type TreeRow, visibleRows } from "../utils/pathTree";
import { cssZoom } from "../utils/domHelpers";
import { FolderIcon } from "./Icons";
import Collapsible from "./Collapsible";

/**
 * The path's folder popup (2026-09-16): the sidebar's tree drawn small under
 * the crumb you clicked, scoped to that folder's parent, for browsing the
 * notes near the open one with the sidebar hidden. Clicking a folder crumb in
 * `University / Archive / Todd's Note` shows University's contents with Archive
 * open and a check beside Todd's Note; a folder row opens and closes in place
 * on a single click, as the sidebar's do; a note row opens the note and closes
 * the popup. The path above never changes while you browse. There is no
 * hover expansion, no flyout, no back row and no filtering: one tree, one
 * surface, and expansion starts fresh every time it opens.
 *
 * Same row grammar as the sidebar (constants/layout.js: the folder glyph on
 * SPINE, labels on TEXT_COL, 28px pills, the indent guide from an open
 * folder's glyph through its children), the elevated ground, border and
 * shadow of every menu, and `useMenuPosition` for the placement. A fixed width
 * so the popup does not breathe as folders open; names truncate.
 *
 * Keys, the tree grammar: Up and Down move through the visible rows, Right
 * opens a folder or steps into it, Left closes one or steps out to it, Enter
 * or Space opens a note or toggles a folder, Home and End reach the edges,
 * Escape closes and focus goes back to the crumb. Focus is parked on the
 * container (a pointer-opened surface paints no ring) and a document listener
 * takes the keys, the ContextMenu/SortMenu grammar; the container is a
 * non-modal `dialog`, so the shell's shortcuts stay quiet while it is open
 * (`focusOwner`). Nothing here moves, renames or deletes.
 */

export interface PathTreeMenuProps {
  /** The crumb's viewport rect; the popup hangs under its left edge. */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** The folder whose contents are shown: a vault-relative `/` path, `""` for the root. */
  scope: string;
  /** Folder paths open when the popup mounts: the crumb and the path below it. */
  initialExpanded: string[];
  activeNote: string | null;
  /** The crumb that opened the popup: a press on it is the crumb's to toggle, not an outside press. */
  opener?: HTMLElement | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}

/** Judged against the menus' 160–200 minimums: room for a folder and a check. */
export const POPUP_W = 280;
/** About twelve rows, then the list scrolls inside the popup. */
export const POPUP_MAX_H = 12 * (TREE_ROW_H + TREE_ROW_GAP) + 8;
/** Each row's element id, for `aria-activedescendant` and scrolling. */
const rowId = (row: TreeRow) => `path-tree-${row.key.replace(/[^\w-]/g, "_")}`;

export default function PathTreeMenu({
  anchor,
  scope,
  initialExpanded,
  activeNote,
  opener = null,
  onOpen,
  onClose,
}: PathTreeMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const { folderTree, sortedRootNotes } = useSidebar() as {
    folderTree: SidebarNode[];
    sortedRootNotes: string[];
  };
  const { noteData } = useNoteData() as { noteData: Record<string, { title: string }> };

  const [expanded, setExpanded] = useState(() => new Set(initialExpanded));
  const contents = useMemo(
    () => scopeContents(folderTree, sortedRootNotes, scope),
    [folderTree, sortedRootNotes, scope],
  );
  const rows = useMemo(() => visibleRows(contents, expanded), [contents, expanded]);

  // The highlight starts on the open note's row when it is in view, else on
  // the first row, and follows the keys and the pointer from there.
  const [activeIndex, setActiveIndex] = useState(() => {
    const at = visibleRows(contents, expanded).findIndex(
      (r) => r.kind === "note" && r.id === activeNote,
    );
    return at >= 0 ? at : 0;
  });
  const active = rows[Math.min(activeIndex, rows.length - 1)] ?? null;
  // Three states on one pill (2026-09-16): the open note keeps the sidebar's
  // own active row, the grey pill in primary ink, for as long as the popup is
  // open; the pointer's row takes the same pill, as every hover does; and once
  // a key has moved the highlight it also carries the accent ring, what
  // :focus-visible means everywhere else, so Enter's target is never in doubt
  // when the highlight has left the open note. The ring goes the moment the
  // pointer takes over again. A pointer-opened popup paints no ring.
  const [keyed, setKeyed] = useState(false);
  const ring = `inset 0 0 0 2px ${ACCENT.primary}`;

  const menuRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  // Focus rests on the tree itself, which names the highlighted row through
  // aria-activedescendant; the scrolling dialog around it is the surface.
  useFocusTrap(treeRef as RefObject<HTMLElement>, true, "container");
  const pos = useMenuPosition(menuRef, true, anchor, { gapY: 4, reflowKey: rows.length }) as {
    top: number;
    left: number;
  } | null;
  // The anchor and the menu's own size are measured under the UI scale (CSS
  // zoom on <html>), and a `top`/`left` written inside it is scaled again on
  // paint, so the placement is divided by the zoom before it becomes a style
  // (domHelpers; the grip and the drop marker do the same).
  const zoom = cssZoom(document.documentElement);

  // Bring the highlighted row into view by the least the list must move
  // (`nearest`), so opening keeps the clicked folder and its neighbours above
  // the note rather than pinning the note to the top.
  useEffect(() => {
    if (!active) return;
    document.getElementById(rowId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const open = useCallback(
    (id: string) => {
      onOpen(id);
      onClose();
    },
    [onOpen, onClose],
  );

  const activate = useCallback(
    (row: TreeRow | null) => {
      if (!row) return;
      if (row.kind === "note") open(row.id);
      else toggle(row.path);
    },
    [open, toggle],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = active ? rows.indexOf(active) : -1;
      const move = (to: number) => {
        setActiveIndex(Math.max(0, Math.min(rows.length - 1, to)));
        setKeyed(true);
      };
      switch (e.key) {
        case "ArrowDown":
          move(i + 1);
          break;
        case "ArrowUp":
          move(i - 1);
          break;
        case "Home":
          move(0);
          break;
        case "End":
          move(rows.length - 1);
          break;
        case "ArrowRight":
          // A closed folder opens; an open one steps into its first child.
          if (active?.kind === "folder" && active.hasChildren) {
            if (active.open) move(i + 1);
            else toggle(active.path);
          }
          break;
        case "ArrowLeft":
          // An open folder closes; anything else steps out to its folder.
          if (active?.kind === "folder" && active.open) toggle(active.path);
          else {
            const parent = parentRowIndex(rows, i);
            if (parent >= 0) move(parent);
          }
          break;
        case "Enter":
        case " ":
          activate(active);
          break;
        case "Escape":
          onClose();
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    [active, rows, toggle, activate, onClose],
  );

  // On the document, as ContextMenu and SortMenu: a window listener added on
  // open would run after the app shell's startup listener, too late to claim
  // Escape and the arrows from it.
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // A press outside closes the popup and is not swallowed: it goes on to do
  // what it would have done, a macOS transient popover's manner rather than
  // a menu's backdrop (Undo with the popup open used to only close it, and
  // read as a dead button, 2026-09-16). Capture phase, so the popup is gone
  // before the press's own target acts. The opening crumb is left to itself:
  // its click toggles the popup closed rather than closing and reopening.
  useEffect(() => {
    const onPress = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (opener?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPress, true);
    return () => document.removeEventListener("mousedown", onPress, true);
  }, [opener, onClose]);

  const scopeName = scope ? (scope.split("/").pop() as string) : "Notes";

  const renderNote = (id: string, depth: number) => {
    const row: TreeRow = { kind: "note", key: `note:${id}`, depth, id };
    const current = id === activeNote;
    const highlighted = active?.key === row.key;
    return (
      <button
        key={row.key}
        id={rowId(row)}
        type="button"
        role="treeitem"
        aria-level={depth + 1}
        aria-current={current ? "true" : undefined}
        tabIndex={-1}
        data-note-id={id}
        onClick={() => open(id)}
        onMouseMove={() => {
          setKeyed(false);
          if (!highlighted) setActiveIndex(rows.findIndex((r) => r.key === row.key));
        }}
        style={{
          ...rowBase,
          paddingLeft: TEXT_COL - ROW_INSET + depth * TREE_INDENT,
          background: highlighted || current ? BG.hover : "transparent",
          color: highlighted || current ? TEXT.primary : TEXT.secondary,
          boxShadow: highlighted && keyed ? ring : undefined,
        }}
      >
        <span style={labelStyle}>{noteData[id]?.title || "Untitled"}</span>
      </button>
    );
  };

  const renderFolder = (folder: SidebarNode, depth: number): ReactNode => {
    const isOpen = expanded.has(folder._path);
    const hasChildren = folder.children.length > 0 || folder.notes.length > 0;
    const row: TreeRow = {
      kind: "folder",
      key: `folder:${folder._path}`,
      depth,
      path: folder._path,
      name: folder.name,
      open: isOpen,
      hasChildren,
    };
    const highlighted = active?.key === row.key;
    return (
      <div key={row.key}>
        <button
          id={rowId(row)}
          type="button"
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isOpen}
          tabIndex={-1}
          data-folder-path={folder._path}
          onClick={() => toggle(folder._path)}
          onMouseMove={() => {
            setKeyed(false);
            if (!highlighted) setActiveIndex(rows.findIndex((r) => r.key === row.key));
          }}
          style={{
            ...rowBase,
            paddingLeft: SPINE - ROW_INSET + depth * TREE_INDENT,
            gap: TEXT_COL - SPINE - SPINE_ICON,
            background: highlighted ? BG.hover : "transparent",
            color: highlighted ? TEXT.primary : TEXT.secondary,
            boxShadow: highlighted && keyed ? ring : undefined,
          }}
        >
          <FolderIcon open={isOpen} />
          <span style={labelStyle}>{folder.name}</span>
        </button>
        {hasChildren && (
          <Collapsible open={isOpen}>
            <div role="group" style={{ position: "relative" }}>
              {/* The sidebar's indent guide: a hairline from the glyph's centre
                  through the children, which is what says "this folder ends here". */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: TREE_ROW_GAP,
                  left: SPINE + SPINE_ICON / 2 + depth * TREE_INDENT - ROW_INSET,
                  width: 1,
                  background: BG.divider,
                  pointerEvents: "none",
                }}
              />
              {folder.children.map((child) => renderFolder(child, depth + 1))}
              {folder.notes.map((id) => renderNote(id, depth + 1))}
            </div>
          </Collapsible>
        )}
      </div>
    );
  };

  const rowBase: CSSProperties = {
    width: "100%",
    height: TREE_ROW_H,
    marginBottom: TREE_ROW_GAP,
    boxSizing: "border-box",
    paddingRight: 8,
    border: "none",
    outline: "none",
    borderRadius: ACTION_RADIUS,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "inherit",
    textAlign: "left",
    transition: "background 0.12s, color 0.12s",
  };
  const labelStyle: CSSProperties = {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <div
        ref={menuRef}
        role="dialog"
        aria-label={`Contents of ${scopeName}`}
        data-testid="path-tree"
        style={{
          position: "fixed",
          top: (pos?.top ?? anchor.bottom + 4) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          zIndex: Z.CONTEXT_MENU,
          width: POPUP_W,
          boxSizing: "border-box",
          overflow: "hidden",
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
          // The chrome row above is the window's drag region; the popup is not.
          ["WebkitAppRegion" as string]: "no-drag",
        }}
      >
        {/* The tree is the scroller, and the focused element: focusing a
            child taller than its scroller scrolls it to the top (the 4px inset
            went missing on every open); focusing the scroller moves nothing. */}
        <div
          ref={treeRef}
          role="tree"
          aria-label={scopeName}
          aria-activedescendant={active ? rowId(active) : undefined}
          tabIndex={-1}
          style={{
            outline: "none",
            maxHeight: POPUP_MAX_H,
            boxSizing: "border-box",
            overflowY: "auto",
            overflowX: "hidden",
            padding: ROW_INSET,
          }}
        >
          {rows.length === 0 && (
            <div style={{ padding: "6px 10px", fontSize: 13, color: TEXT.muted }}>Empty folder</div>
          )}
          {contents.folders.map((folder) => renderFolder(folder, 0))}
          {contents.notes.map((id) => renderNote(id, 0))}
        </div>
      </div>
    </>
  );
}
