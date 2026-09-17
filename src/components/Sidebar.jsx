import { useEffect, useMemo, useState, memo, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { useNoteData } from "../context/NoteDataContext";
import { useSidebar } from "../context/SidebarContext";
import { extractAllTags } from "../utils/tags";
import { useSettings } from "../context/SettingsContext";
import {
  FolderIcon,
  FileIcon,
  NewFolderIcon,
  SearchIcon,
  MoreHorizontalIcon,
  NewNoteIcon,
  SidebarToggleIcon,
  SortIcon,
} from "./Icons";
import {
  BTN_GAP,
  CHROME_TOP,
  CHROME_BTN,
  MAC_TRAFFIC_INSET,
  ChromeButton,
  SHORTCUTS,
  trafficLightsShown,
} from "./EditorChrome";
import { Tooltip, useTooltip } from "./Tooltip";
import SortMenu from "./SortMenu";
import Collapsible from "./Collapsible";
import { isElectronMac } from "../utils/platform";
import { SEARCH_HEADING, TagChips, renderHighlightedTitle, renderSnippet } from "./SearchParts";
import Wordmark from "./Wordmark";
import { PANEL_FADE_MS, PANEL_MS, panelTransition } from "../tokens/motion";
import {
  ACTION_RADIUS,
  HEADER_RIGHT_INSET,
  ROW_INSET,
  SIDEBAR_TREE_INSET,
  SPINE,
  SPINE_ICON,
  TEXT_COL,
  TREE_INDENT,
  TREE_ROW_GAP,
  TREE_ROW_H,
  WORDMARK_H,
} from "../constants/layout";

const hBg = (el, c) => {
  el.style.background = c;
};

// ── Sidebar header geometry ─────────────────────────────────────────────────
// Tweakable in one place: wordmark left, panel toggle right near the divider.
/** Left inset of the wordmark from the sidebar edge (web and full screen;
 *  MAC_TRAFFIC_INSET otherwise). The right inset, the wordmark's size and the
 *  control box live in constants/layout.js, because the sidebar's minimum
 *  width is derived from what this row holds. */
const HEADER_LEFT_INSET = 12;
/** Optical drop for the whole header row (wordmark + toggle together). */
const HEADER_NUDGE = 4;

// ── Desktop alignment system: one spine, one text column ────────────────────
// The row grammar (SPINE, TEXT_COL, the row height and pill radius) lives in
// constants/layout.js since 2026-09-16, shared with the path's folder popup so
// the popup is this tree drawn small. Rows are inset from both sidebar edges
// so hover pills breathe; tree pills keep the 4px left inset but run only
// ROW_INSET_RIGHT short of the scrollbar gutter on the right (judged live
// 2026-08-23). Pairs with the .sidebar-scroll thumb override in GlobalStyles.jsx.
const ROW_INSET_RIGHT = 2;
/** Gap between a folder glyph and its name = TEXT_COL − SPINE − SPINE_ICON. */
const ICON_GAP = TEXT_COL - SPINE - SPINE_ICON;
/** The spine as this column draws it: SPINE plus the sidebar's own inset.
 *  Every desktop x below (New note, the Notes row, rows, guides) starts here,
 *  so the column moves as one and the popup, on the bare SPINE, does not. */
const TREE_SPINE = SPINE + SIDEBAR_TREE_INSET;

// ── Row grammar (desktop) ────────────────────────────────────────────────────
// Picito-style rows: full-width hit areas (minus ROW_INSET), 12px radius,
// neutral BG.hover for hover AND selected, no boxes at rest. Tree rows are
// 28px with a 2px rhythm gap; the vault header is the same height.
/** The labelled New note row: a touch taller than a tree row, as the one
 *  action among a list of names. */
const ACTION_ROW_H = 32;
// ···-menu placement, tunable here (judged live 2026-08-23). The menu drops
// just below the note row and grows rightward into the editor, its left edge
// slightly left of the ··· button.
/** Gap between the row's bottom edge and the menu. */
const NOTE_MENU_GAP = 4;
/** How far left of the ··· button's left edge the menu's left edge sits. */
const NOTE_MENU_SHIFT = 8;
/**
 * The anchor a row's ··· hands its menu (2026-09-16): the row's own rectangle
 * with the menu's gap either side, left edge shifted left of the dots. Below
 * the row when it fits; when it does not, useMenuPosition flips it to sit
 * ABOVE the row. With a point anchor under the row the flipped menu ended at
 * the row's bottom edge, over the row, and the pointer still resting on the
 * dots sat inside its last item, Delete, which took the hover highlight the
 * moment the menu opened (seen live on a folder low in the window).
 */
const rowMenuAnchor = (btn, row) => ({
  top: row.top - NOTE_MENU_GAP,
  bottom: row.bottom + NOTE_MENU_GAP,
  left: btn.left - NOTE_MENU_SHIFT,
  right: btn.right,
});
/** The folder row's two trailing glyph boxes (New note, ···), 20px each with
 *  4px between them (judged live 2026-09-16: adjacent, the pen's ink sat on
 *  the dots), the note row's single ··· slot twice over. */
const FOLDER_ACTIONS_W = 44;

/**
 * The inline rename field is invisible (2026-09-16, judged against ChatGPT's
 * rows): no border, fill or padding, the row's own font at the row's own
 * place, so nothing on screen moves when it appears and the selected name is
 * the whole signal. Before this it was a bordered accent box with 5px of
 * padding that shifted the name right, and the folder's was drawn at
 * 12.5px/500 under a 14px/400 label, so the name shrank. The row itself
 * stands down while it renames (`.is-renaming` in GlobalStyles: no pill,
 * actions hidden). The height is the row's so the input's centred text sits
 * on the label's baseline.
 * @param {{ TEXT: { primary: string } }} theme
 * @param {number} fontSize
 */
const renameFieldStyle = ({ TEXT }, fontSize) => ({
  background: "transparent",
  border: 0,
  borderRadius: 0,
  padding: 0,
  margin: 0,
  outline: "none",
  boxShadow: "none",
  color: TEXT.primary,
  caretColor: TEXT.primary,
  fontSize,
  fontFamily: "inherit",
  fontWeight: 400,
  lineHeight: "inherit",
  height: "100%",
  flex: 1,
  minWidth: 0,
  cursor: "text",
});

// ── Section headers (desktop) ───────────────────────────────────────────────
// Header labels sit on the SPINE with the icons, one step quieter in colour
// (TEXT.secondary) so they read as structure without out-shouting the selected
// row. The trailing button's 16px glyph lands 12px from the right edge,
// mirroring the spine. No chevrons — the sections do not collapse.
//
// One spacing rule for every section: SECTION_GAP above the header, then
// SECTION_CONTENT_GAP down to its first row. `Folders` gets its top gap from the
// action group's own bottom padding, which is set to the same 12.
const SECTION_HEADER_H = TREE_ROW_H;
const SECTION_HEADER_LEFT = TREE_SPINE;
/** The header's 16px glyphs share a right edge with the chrome row's 18px ones:
 *  HEADER_RIGHT_INSET (12) + the chrome glyph's 7px inset − this row's 8px. */
const SECTION_HEADER_RIGHT = 5;
/** Header controls share the chrome row's 32px hit box and 18px nav glyph. */
const SECTION_BTN = 32;
const SECTION_GAP = 12;
const SECTION_CONTENT_GAP = 2;
// Header controls (New folder, Sort) are hidden at rest and revealed, muted,
// while the pointer is on the Notes row or a keyboard focus is in it, lifting
// to full ink on their own hover; the pair is held while the Sort menu is open
// (2026-09-16, Tyr's ask). This is the row's third flip: hover-revealed on
// 2026-08-23, visible at rest on 2026-09-12 ("a control you must hover to find
// is not one"), and hidden again now because the folder rows under it reveal
// their own pair on hover since the same day, so a row that kept its glyphs
// was the odd one out. All rest/emphasis states are CSS
// (.sidebar-section-action in GlobalStyles); Sidebar.jsx only adds the
// held-open class while the menu is up.

/**
 * The one section lid: the list's name left, its controls right.
 * `role="presentation"` keeps it out of the tree below — the text still
 * reads, it just isn't announced as a row. The name is the plain word
 * `Notes`, quiet muted ink: a label for the list, not a second wordmark and
 * not the storage folder's name, which lives in Settings → Storage beside the
 * control that changes it (2026-09-12).
 */
function SectionHeader({ label, TEXT, first, children, dropRoot, menuOpen }) {
  return (
    <div
      role="presentation"
      // `menu-open` holds the row's controls revealed while one of their menus
      // is up, as a folder row holds its pair (see .sidebar-section-header).
      className={menuOpen ? "sidebar-section-header menu-open" : "sidebar-section-header"}
      // The header doubles as the visible root drop target during a drag:
      // drop on a folder → into that folder, drop here → back to the root.
      // useSidebarDrag finds it by this attribute and paints it neutrally.
      {...(dropRoot ? { "data-drop-root": "true" } : {})}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: SECTION_HEADER_H,
        boxSizing: "border-box",
        paddingLeft: SECTION_HEADER_LEFT,
        paddingRight: SECTION_HEADER_RIGHT,
        // A first header sits a touch below the chrome row rather than on it.
        marginTop: first ? 10 : SECTION_GAP,
        marginBottom: SECTION_CONTENT_GAP,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          // Row size, a step quieter in ink, a step heavier in weight: a
          // label for the list, not a heading over it.
          fontSize: 14,
          fontWeight: 500,
          color: TEXT.muted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 2 }}>
        {children}
      </span>
    </div>
  );
}

/**
 * A trailing header control (New folder, Sort; Search until 2026-09-16, now
 * on the window's row, and the ··· until the same day). One component so all
 * wear the same geometry and the same reveal/hover ink. Never more than
 * three: muted glyphs in threes read as a set, four read as a toolbar.
 * `active` is the control whose menu is open: full ink on its hover surface
 * until the menu closes.
 */
function SectionAction({ onClick, label, shortcut, ariaLabel, active, children, ...rest }) {
  // The row's controls name themselves with the chrome's chip (2026-09-17),
  // after the same rest, so brushing across the row on the way to a folder
  // shows nothing.
  const tip = useTooltip();
  const ref = useRef(null);
  return (
    <button
      type="button"
      ref={ref}
      className={active ? "sidebar-section-action is-active" : "sidebar-section-action"}
      onClick={onClick}
      aria-label={ariaLabel || label}
      style={{
        width: SECTION_BTN,
        height: SECTION_BTN,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
      }}
      {...rest}
      {...tip.handlers}
    >
      {children}
      {tip.shown && (
        <Tooltip
          label={label}
          shortcut={shortcut}
          anchor={ref.current}
          placement="below"
          testId="chrome-tooltip"
        />
      )}
    </button>
  );
}

/**
 * The sidebar's one labelled action: New note, above the list it adds to.
 * A full-width pill in the tree's own row grammar (hover to BG.hover, the
 * same 12px radius and 4px inset), so it reads as part of the column rather
 * than as a button dropped on it — no filled accent, no border at rest. The
 * plus sits on the structural SPINE and the label on TEXT_COL, with the
 * folder names and note titles below it.
 */
function SidebarNewNote({ onClick, TEXT, BG }) {
  return (
    <button
      type="button"
      className="sidebar-action-row"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: `calc(100% - ${ROW_INSET + ROW_INSET_RIGHT}px)`,
        marginLeft: ROW_INSET,
        marginRight: ROW_INSET_RIGHT,
        minHeight: ACTION_ROW_H,
        boxSizing: "border-box",
        paddingLeft: TREE_SPINE - ROW_INSET,
        paddingRight: 8,
        background: "none",
        border: "none",
        borderRadius: ACTION_RADIUS,
        cursor: "pointer",
        color: TEXT.secondary,
        fontFamily: "inherit",
        fontSize: 14,
        textAlign: "left",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        hBg(e.currentTarget, BG.hover);
        e.currentTarget.style.color = TEXT.primary;
      }}
      onMouseLeave={(e) => {
        hBg(e.currentTarget, "transparent");
        e.currentTarget.style.color = TEXT.secondary;
      }}
    >
      {/* Left-aligned in a box the width of the spine-to-label gap, so the
          glyph starts on SPINE and the label starts exactly on TEXT_COL. */}
      <span
        style={{
          width: TEXT_COL - SPINE,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <NewNoteIcon size={18} />
      </span>
      New note
    </button>
  );
}

/**
 * Mobile's inline "+ New Folder" / "+ New Note" tree rows. Desktop moved both
 * actions into headers; mobile keeps them as quiet rows at the foot of each
 * group, with the note row indented under the folder rows.
 */
function MobileTreeAction({ label, onClick, paddingLeft, borderLeft, TEXT, BG, accentColor }) {
  return (
    <button
      onClick={onClick}
      role="treeitem"
      style={{
        width: "100%",
        border: "none",
        cursor: "pointer",
        background: "transparent",
        borderLeft,
        padding: `12px 16px 12px ${paddingLeft}px`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: TEXT.secondary,
        fontSize: 17,
        fontFamily: "inherit",
        fontWeight: 500,
        opacity: 0.55,
        transition: "background 0.12s, color 0.12s, opacity 0.12s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        hBg(e.currentTarget, BG.elevated);
        e.currentTarget.style.color = TEXT.primary;
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        hBg(e.currentTarget, "transparent");
        e.currentTarget.style.color = TEXT.secondary;
        e.currentTarget.style.opacity = "0.55";
      }}
    >
      <span style={{ width: 17, flexShrink: 0, textAlign: "center", color: accentColor }}>+</span>
      <span>{label}</span>
    </button>
  );
}

const Sidebar = memo(function Sidebar({
  activeNote,
  toggle,
  openNote,
  renameNote,
  setCtxMenu,
  renameFolder,
  createFolder,
  createNote,
  handleSidebarPointerDown,
  handleSearchResultOpen,
  selectedNotes,
  handleNoteClick,
  clearSelection,
  ctxMenuNoteId,
  ctxMenuFolderId,
  isMobile,
  // Desktop only: the Notes row's Search glyph opens the search palette.
  onOpenSearch,
}) {
  const {
    accentColor,
    accentText,
    chromeBg,
    sidebarVisible,
    sidebarWidth,
    fullScreen,
    toggleSidebar,
  } = useLayout();
  // A hidden sidebar keeps its DOM — drag hit-tests and the scroll position
  // survive a collapse — but a zero-width, overflow-hidden panel still hands
  // its buttons to Tab and to a screen reader, and the editor header renders
  // the toggle, Search and New note while the panel is away. Its controls are
  // therefore inert while it is not showing, so exactly one of each is ever
  // reachable. Only the controls: `inert` on the whole column would also
  // swallow the second click of a double-click while the panel animates shut.
  const hiddenControls = !isMobile && !sidebarVisible;
  const { setSettingsOpen } = useSettings();
  const { theme } = useTheme();
  const wordmarkTip = useTooltip();
  const wordmarkRef = useRef(null);
  const { BG, TEXT, ACCENT } = theme;
  const { noteData } = useNoteData();
  const {
    search,
    setSearch,
    searchFocused,
    setSearchFocused,
    searchInputRef,
    sidebarScrollRef,
    expanded,
    setExpanded,
    filteredTree,
    fNotes,
    renamingFolder,
    setRenamingFolder,
    renamingNote,
    setRenamingNote,
    searchMode,
    searchResults,
    activeResultIndex,
    navigateResults,
    clearSearch,
    getActiveResult,
    sortMode,
    setSortMode,
  } = useSidebar();

  // Anchor rect of the ··· trigger, or null when the vault menu is closed.
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null);
  const closeSortMenu = () => setSortMenuAnchor(null);

  // Tag suggestions for # search
  const tagSuggestions = useMemo(() => {
    if (!search.startsWith("#")) return null;
    const tagMap = extractAllTags(noteData);
    const filter = search.slice(1).toLowerCase();
    const tags = [...tagMap.entries()]
      .map(([tag, noteIds]) => ({ tag, count: noteIds.size }))
      .filter((t) => !filter || t.tag.toLowerCase().includes(filter))
      .sort((a, b) => b.count - a.count);
    return tags;
  }, [search, noteData]);

  // Render a note row at given depth
  const renderNote = (nId, depth) => {
    const n = noteData[nId];
    if (!n || n._draft) return null;
    const act = activeNote === nId;
    const sel = selectedNotes?.has(nId);
    // The row that opened the note menu (··· or right-click) holds its hover
    // pill and keeps its dots visible until the menu closes.
    const menuOpen = ctxMenuNoteId === nId;
    const mobFont = isMobile ? 17 : 14;
    const mobGap = isMobile ? 9 : 5;
    // Desktop: quiet row grammar — a full-width pill; hover, selection and
    // multi-select all use neutral BG.hover, and the active note is
    // distinguished by ink (weight + TEXT.primary), never by accent. A note's
    // title starts where a folder at the same depth puts its glyph (SPINE +
    // depth × TREE_INDENT, the folder row's own padding; 2026-09-16), so notes
    // and folders at one depth share a left edge and a folder's name is further
    // right only by its glyph. The folder popup keeps its notes on TEXT_COL
    // (PathTreeMenu), a deliberate difference. Mobile keeps the existing
    // accent-tinted pill grammar untouched.
    const rowStyle = isMobile
      ? {
          width: "calc(100% - 8px)",
          marginLeft: 5,
          marginRight: 3,
          background: act ? `${accentColor}30` : sel ? `${accentColor}18` : "transparent",
          borderRadius: 6,
          // The removed FileIcon's width + gap is folded into the left padding
          // so titles keep their column under the folder names; the chevron
          // removal took its allowance back out of both row kinds.
          padding: `12px 16px 12px ${7 + depth * TREE_INDENT + 19 + 5}px`,
          boxShadow: "none",
        }
      : {
          width: `calc(100% - ${ROW_INSET + ROW_INSET_RIGHT}px)`,
          marginLeft: ROW_INSET,
          marginRight: ROW_INSET_RIGHT,
          marginBottom: TREE_ROW_GAP,
          height: TREE_ROW_H,
          boxSizing: "border-box",
          background: act || sel || menuOpen ? BG.hover : "transparent",
          borderRadius: ACTION_RADIUS,
          padding: `0 8px 0 ${TREE_SPINE - ROW_INSET + depth * TREE_INDENT}px`,
        };
    return (
      <button
        key={nId}
        data-note-id={nId}
        role="treeitem"
        aria-selected={act}
        onClick={handleNoteClick ? (e) => handleNoteClick(nId, e) : () => openNote(nId)}
        // Double-click = rename in place: the row swaps its title for the same
        // inline input folders use. The two single-clicks it also fires just
        // open the note, harmlessly.
        onDoubleClick={!isMobile && renamingNote !== nId ? () => setRenamingNote(nId) : undefined}
        className={renamingNote === nId ? "sidebar-note is-renaming" : "sidebar-note"}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!sel && clearSelection) clearSelection();
          setCtxMenu({ x: e.clientX, y: e.clientY, type: "note", id: nId });
        }}
        style={{
          ...rowStyle,
          marginTop: 0,
          border: "none",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: mobGap,
          color: act || sel ? TEXT.primary : TEXT.secondary,
          fontSize: mobFont,
          fontFamily: "inherit",
          // Desktop active note relies on the pill alone — no bold (judged live
          // 2026-08-23). Mobile keeps its weight cue.
          fontWeight: isMobile && act ? 600 : 400,
          transition: "background 0.12s",
          textAlign: "left",
        }}
        onMouseEnter={(e) => {
          if (!act && !sel) hBg(e.currentTarget, BG.hover);
          else if (isMobile && sel && !act) hBg(e.currentTarget, `${accentColor}22`);
        }}
        onMouseLeave={(e) => {
          if (!act && !sel && !menuOpen) hBg(e.currentTarget, "transparent");
          else if (isMobile && sel && !act) hBg(e.currentTarget, `${accentColor}18`);
        }}
      >
        {renamingNote === nId ? (
          <input
            autoFocus
            defaultValue={n.title}
            aria-label="Rename note"
            // Finder-style: arrive with the whole name selected, ready to
            // overwrite; a click puts the caret where you aim.
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            // Note rows are draggable — typing/selecting in the input must
            // never start a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameNote(nId, e.target.value);
              setRenamingNote(null);
            }}
            data-testid="rename-field"
            // The field owns Enter and Escape: prevented, so the app shell
            // never treats them as its own (Escape also closed an overlay
            // sidebar under the field).
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                renameNote(nId, e.target.value);
                setRenamingNote(null);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setRenamingNote(null);
              }
            }}
            style={renameFieldStyle(theme, mobFont)}
          />
        ) : (
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
          >
            {n.title}
          </span>
        )}
        {/* Trailing ··· opens the same note menu as right-click. The slot is
            zero-width at rest so a long title truncates against the full row;
            hovering the row (or keyboard focus) expands it and the title
            re-truncates shorter — sizing lives in .sidebar-note-more in
            GlobalStyles, so no inline width/margin here except while the menu
            holds the slot open. span+role, tabIndex -1: a real button nested
            in the treeitem button is invalid HTML and fails axe
            nested-interactive; the row itself stays the keyboard path (focus
            reveals the dots, right-click opens the menu). */}
        {!isMobile && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Note actions"
            title="Note actions"
            className="sidebar-note-more"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!sel && clearSelection) clearSelection();
              const btn = e.currentTarget.getBoundingClientRect();
              const row = e.currentTarget.closest("[data-note-id]").getBoundingClientRect();
              // Drop below the row, left edge shifted left of the dots, growing
              // rightward into the editor; above the row when there is no room
              // (rowMenuAnchor). Right-click keeps cursor placement.
              const anchor = rowMenuAnchor(btn, row);
              setCtxMenu({ x: anchor.left, y: anchor.bottom, anchor, type: "note", id: nId });
            }}
            style={{
              // Inline styles out-specify the class's collapsed rest state,
              // holding the slot open (and inked) while this row's menu is up.
              opacity: menuOpen ? 1 : undefined,
              width: menuOpen ? 20 : undefined,
              height: 24,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <MoreHorizontalIcon size={16} />
          </span>
        )}
      </button>
    );
  };

  // Render a folder and its children recursively
  const renderFolder = (folder, depth) => {
    const folderPath = folder._path || folder.name;
    // Coerced so aria-expanded is always announced — with no chevron it is the
    // only programmatic expansion signal (undefined would omit the attribute).
    const isOpen = !!expanded[folderPath];
    const hasChildren = folder.children.length > 0 || folder.notes.length > 0;
    // The row that opened the folder menu (··· or right-click) holds its
    // actions visible until the menu closes, as a note row holds its dots.
    const folderMenuOpen = ctxMenuFolderId === folderPath;
    return (
      <div key={folderPath}>
        <button
          data-folder-path={folderPath}
          role="treeitem"
          aria-expanded={isOpen}
          className={
            renamingFolder === folderPath ? "sidebar-folder is-renaming" : "sidebar-folder"
          }
          // A click toggles, every click; no double-click rename (2026-09-16,
          // Tyr's call): the first click of the pair toggled the folder under
          // the field, which read as a glitch. A folder is renamed from its
          // ··· menu, as ChatGPT's projects are. Notes keep double-click, since
          // a click on a note only opens it.
          onClick={() => toggle(folderPath)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folderPath });
          }}
          style={{
            // Desktop: folder glyph on the SPINE, name on TEXT_COL, same quiet
            // pill grammar as note rows. Mobile keeps its previous geometry.
            ...(isMobile
              ? {
                  width: "100%",
                  padding: `12px 16px 12px ${10 + depth * TREE_INDENT}px`,
                }
              : {
                  width: `calc(100% - ${ROW_INSET + ROW_INSET_RIGHT}px)`,
                  marginLeft: ROW_INSET,
                  marginBottom: TREE_ROW_GAP,
                  height: TREE_ROW_H,
                  boxSizing: "border-box",
                  padding: `0 8px 0 ${TREE_SPINE - ROW_INSET + depth * TREE_INDENT}px`,
                  borderRadius: ACTION_RADIUS,
                }),
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 8 : ICON_GAP,
            color: TEXT.secondary,
            fontSize: isMobile ? 17 : 14,
            // 400 matches note and action rows — the folder glyph alone
            // distinguishes the row kind; headers carry the hierarchy.
            fontWeight: 400,
            fontFamily: "inherit",
            transition: "background 0.12s, color 0.12s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            hBg(e.currentTarget, isMobile ? BG.elevated : BG.hover);
            e.currentTarget.style.color = TEXT.primary;
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
        >
          {/* No disclosure chevron — the whole row toggles, the open-folder icon
              and indented children carry the state. aria-expanded still announces
              it. The glyph inherits the row's currentColor like the other nav icons. */}
          <FolderIcon open={isOpen} size={isMobile ? 20 : undefined} />
          {renamingFolder === folderPath ? (
            <input
              autoFocus
              defaultValue={folder.name}
              aria-label="Rename folder"
              data-testid="rename-field"
              // Finder-style, as a note's: the whole name selected, ready to
              // overwrite (until 2026-09-16 the caret sat at the end and
              // typing appended). With no border the selection is the only
              // sign the field is there, so this is not polish.
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.stopPropagation()}
              // Folder rows are draggable too; a press in the field must never
              // start a drag.
              onPointerDown={(e) => e.stopPropagation()}
              // Commit once: Enter commits and unmounts the field, and the blur
              // that can follow must not rename the (now moved) directory again.
              onBlur={(e) => {
                if (e.target.dataset.committed) return;
                e.target.dataset.committed = "1";
                renameFolder(folderPath, e.target.value.trim());
                setRenamingFolder(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.dataset.committed = "1";
                  renameFolder(folderPath, e.currentTarget.value.trim());
                  setRenamingFolder(null);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.currentTarget.dataset.committed = "1";
                  setRenamingFolder(null);
                }
              }}
              style={renameFieldStyle(theme, isMobile ? 17 : 14)}
            />
          ) : (
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {folder.name}
            </span>
          )}
          {/* Trailing New note and ··· (2026-09-16, ChatGPT's project rows):
              what a folder does, write here and organise here. Zero-width
              at rest so a long name truncates against the full row, revealed
              on row hover or focus exactly as a note row's dots are
              (.sidebar-folder-actions in GlobalStyles), held open while this
              row's menu is up. New note (named for the folder, so it is never
              the sidebar pill's own name) makes the note inside this folder;
              ··· opens the same folder menu as right-click, growing rightward.
              span+role, tabIndex -1, as the note dots: a real button inside
              the treeitem button fails axe nested-interactive; the row stays
              the keyboard path (right-click opens the menu). Clicks stop here
              so the row does not toggle. */}
          {!isMobile && (
            <span
              className="sidebar-folder-actions"
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                opacity: folderMenuOpen ? 1 : undefined,
                width: folderMenuOpen ? FOLDER_ACTIONS_W : undefined,
              }}
            >
              <span
                role="button"
                tabIndex={-1}
                aria-label={`New note in ${folder.name}`}
                title={`New note in ${folder.name}`}
                className="sidebar-folder-action"
                onClick={(e) => {
                  e.stopPropagation();
                  createNote(folderPath);
                }}
              >
                <NewNoteIcon size={16} />
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Folder actions"
                title="Folder actions"
                className="sidebar-folder-action"
                onClick={(e) => {
                  e.stopPropagation();
                  const btn = e.currentTarget.getBoundingClientRect();
                  const row = e.currentTarget.closest("[data-folder-path]").getBoundingClientRect();
                  const anchor = rowMenuAnchor(btn, row);
                  setCtxMenu({
                    x: anchor.left,
                    y: anchor.bottom,
                    anchor,
                    type: "folder",
                    id: folderPath,
                  });
                }}
              >
                <MoreHorizontalIcon size={16} />
              </span>
            </span>
          )}
        </button>
        {hasChildren && (
          <Collapsible open={isOpen}>
            {/* An indent guide (2026-09-05), a hairline dropping from the
                folder glyph's centre through its children; the line ending is
                what says "this folder ends here" in a mixed tree. */}
            <div style={{ position: "relative" }}>
              {!isMobile && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: TREE_ROW_GAP,
                    left: TREE_SPINE + SPINE_ICON / 2 + depth * TREE_INDENT,
                    width: 1,
                    background: BG.divider,
                    pointerEvents: "none",
                  }}
                />
              )}
              {folder.children.map((child) => renderFolder(child, depth + 1))}
              {folder.notes.map((nId) => renderNote(nId, depth + 1))}
            </div>
          </Collapsible>
        )}
      </div>
    );
  };

  const searchInput = (
    <input
      ref={searchInputRef}
      type="text"
      aria-label="Search notes"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      onFocus={() => setSearchFocused(true)}
      onBlur={() => setSearchFocused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          navigateResults?.("down");
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          navigateResults?.("up");
        } else if (e.key === "Enter") {
          e.preventDefault();
          const result = getActiveResult?.();
          if (result) handleSearchResultOpen?.(result.noteId, result.matchBlockId);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setSearch("");
          clearSearch?.();
          searchInputRef.current?.blur();
        }
      }}
      style={{
        background: "none",
        border: "none",
        outline: "none",
        color: TEXT.primary,
        fontSize: isMobile ? 15 : 13,
        width: "100%",
        fontFamily: "inherit",
      }}
      placeholder={isMobile ? "Search..." : "Search"}
    />
  );

  const clearSearchButton = search ? (
    <button
      aria-label="Clear search"
      onClick={(e) => {
        e.stopPropagation();
        setSearch("");
        clearSearch?.();
      }}
      style={{
        background: "none",
        border: "none",
        color: TEXT.muted,
        cursor: "pointer",
        fontSize: 13,
        padding: "0 2px",
        lineHeight: 1,
        flexShrink: 0,
        transition: "color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = TEXT.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = TEXT.muted;
      }}
    >
      {"✕"}
    </button>
  ) : null;

  // One shared scroller serves every sidebar state: reset its offset when
  // search mode flips, matching the implicit reset the per-branch scrollers
  // used to get by remounting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: searchMode is the trigger (the flip resets), not a body input.
  useEffect(() => {
    if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = 0;
  }, [searchMode, sidebarScrollRef]);

  // Auto-scroll active search result into view
  useEffect(() => {
    if (!searchMode) return;
    const el = sidebarScrollRef.current?.querySelector(
      `[data-search-index="${activeResultIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeResultIndex, searchMode, sidebarScrollRef]);

  return (
    <div
      className={isMobile ? undefined : "panel-motion"}
      style={
        isMobile
          ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }
          : {
              // The column is its full width whatever the wrapper is showing
              // of it, and slides out under the window's edge as the wrapper
              // closes over it (2026-09-14). Before this it was `flex: 1` in
              // a wrapper whose width tweened to 0, so every frame of the
              // toggle re-laid it out: the New note pill shrank from 234px to
              // 16, rows re-truncated, and the Notes row's glyphs piled up.
              // Nothing inside reflows now; the contents fade instead, out
              // as the slide begins and in as it ends. `transform: none` at
              // rest, never an identity translate, so nothing fixed inside
              // the column gains a containing block. Once the slide has
              // ended the column is `visibility: hidden` (flipped at the end
              // of the hide and at the start of the show), so its rows are
              // out of the tab order and off the accessibility tree while
              // the DOM and scroll position stay; `inert` on the whole
              // column was tried and broke a double-click mid-slide.
              width: sidebarWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              transform: sidebarVisible ? "none" : `translateX(${-sidebarWidth}px)`,
              opacity: sidebarVisible ? 1 : 0,
              visibility: sidebarVisible ? "visible" : "hidden",
              transition: `${panelTransition("transform")}, opacity ${PANEL_FADE_MS}ms ease ${
                sidebarVisible ? PANEL_MS - PANEL_FADE_MS : 0
              }ms, visibility 0s linear ${sidebarVisible ? 0 : PANEL_MS}ms`,
            }
      }
    >
      {/* Sidebar header: wordmark left, panel toggle right near the divider.
          On macOS Electron the native traffic lights sit in this row too
          (hiddenInset, no title bar): the wordmark shifts right to clear them
          (not in full screen, where macOS hides them) and the whole header
          doubles as the window drag region — the wordmark and toggle opt back
          out so they stay clickable. */}
      {!isMobile && (
        <div
          data-drag-region=""
          inert={hiddenControls}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: CHROME_TOP + CHROME_BTN,
            boxSizing: "border-box",
            // Children are centred, so top padding shifts them by half of it.
            // Height is unchanged, so nothing below the header moves.
            paddingTop: HEADER_NUDGE * 2,
            paddingLeft: trafficLightsShown(fullScreen) ? MAC_TRAFFIC_INSET : HEADER_LEFT_INSET,
            paddingRight: HEADER_RIGHT_INSET,
            flexShrink: 0,
            WebkitAppRegion: isElectronMac ? "drag" : undefined,
          }}
        >
          <button
            data-testid="wordmark-settings-button"
            ref={wordmarkRef}
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Notes — open Settings"
            style={{
              position: "relative",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              WebkitAppRegion: "no-drag",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.75";
              wordmarkTip.handlers.onMouseEnter();
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              wordmarkTip.handlers.onMouseLeave();
            }}
            onMouseDown={wordmarkTip.handlers.onMouseDown}
            onMouseUp={wordmarkTip.handlers.onMouseUp}
            onFocus={wordmarkTip.handlers.onFocus}
            onBlur={wordmarkTip.handlers.onBlur}
            onKeyDown={wordmarkTip.handlers.onKeyDown}
          >
            {/* WORDMARK_H, 18px: a label, not a headline — at 20 it out-shouted
                the note's H1. Drawn in the theme's ink (Wordmark picks the
                per-theme asset); the 0.92-opacity stand-in for a black asset is
                gone with it. */}
            <Wordmark height={WORDMARK_H} />
            {/* The wordmark is the one control nothing marks as clickable: the
                chip is what says it opens Settings. */}
            {wordmarkTip.shown && (
              <Tooltip
                label="Settings"
                shortcut={SHORTCUTS.settings}
                anchor={wordmarkRef.current}
                placement="below"
                testId="chrome-tooltip"
              />
            )}
          </button>
          {/* Search and the toggle, one group at the chrome row's own gap
              (2026-09-16; Search sat on the Notes row from 2026-09-12). The
              same two neighbours the collapsed header shows, so Search keeps
              its place beside the toggle in both sidebar states. */}
          <div style={{ display: "flex", alignItems: "center", gap: BTN_GAP, flexShrink: 0 }}>
            <ChromeButton onClick={onOpenSearch} label="Search notes" shortcut={SHORTCUTS.search}>
              <SearchIcon size={18} />
            </ChromeButton>
            <ChromeButton
              onClick={toggleSidebar}
              label="Toggle sidebar"
              shortcut={SHORTCUTS.toggleSidebar}
            >
              <SidebarToggleIcon />
            </ChromeButton>
          </div>
        </div>
      )}

      {/* Search (mobile) */}
      {isMobile && (
        <div style={{ padding: "8px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: theme.searchInputBg,
              color: TEXT.muted,
              borderRadius: 14,
              height: 40,
              width: "100%",
              padding: "0 12px",
              border: `1px solid ${searchFocused ? `${accentColor}60` : BG.divider}`,
              transition: "border-color 0.2s ease",
              overflow: "hidden",
            }}
          >
            <SearchIcon />
            {searchInput}
            {clearSearchButton}
          </div>
        </div>
      )}

      {/* One scroller for every sidebar state (judged live 2026-08-23): the
          desktop action group lives INSIDE it as a sticky block, so the
          scrollbar track spans from New note down while the actions stay
          pinned and the search field keeps its DOM position (no remount
          mid-typing) across search-mode flips. It also puts every pill on
          the same right boundary beside the gutter. */}
      <div
        ref={sidebarScrollRef}
        className="sidebar-scroll"
        onPointerDown={handleSidebarPointerDown}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          padding: isMobile ? "2px 0" : "0 0 2px",
        }}
      >
        {/* Search results and the empty state are mobile-only: on desktop
            the palette owns them and the tree stays put behind it. */}
        {isMobile && searchMode && searchResults.results.length > 0 ? (
          <>
            {tagSuggestions && tagSuggestions.length > 0 && (
              <TagChips
                title="Tags"
                tags={tagSuggestions}
                limit={20}
                onPick={(tag) => setSearch(`#${tag}`)}
                TEXT={TEXT}
                ACCENT={ACCENT}
              >
                <div
                  style={{ ...SEARCH_HEADING, color: TEXT.muted, marginTop: 10, marginBottom: 2 }}
                >
                  Notes
                </div>
              </TagChips>
            )}
            <div style={{ fontSize: 11, color: TEXT.muted, padding: "4px 14px 8px" }}>
              {searchResults.totalCount <= 20
                ? `${searchResults.totalCount} result${searchResults.totalCount !== 1 ? "s" : ""}`
                : `Showing 20 of ${searchResults.totalCount}`}
            </div>
            {searchResults.results.map((result, i) => {
              const isActive = i === activeResultIndex;
              const folderPath = result.folder ? result.folder.split("/").join(" / ") : null;
              return (
                <button
                  key={result.noteId}
                  data-search-index={i}
                  aria-current={isActive || undefined}
                  onClick={() => handleSearchResultOpen?.(result.noteId, result.matchBlockId)}
                  style={{
                    width: "calc(100% - 8px)",
                    marginLeft: 5,
                    marginRight: 3,
                    border: "none",
                    outline: "none",
                    appearance: "none",
                    WebkitAppearance: "none",
                    cursor: "pointer",
                    background: isActive ? `${accentColor}15` : "transparent",
                    borderRadius: 6,
                    padding: "5px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) hBg(e.currentTarget, BG.hover);
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) hBg(e.currentTarget, "transparent");
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <FileIcon active={isActive} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? TEXT.primary : TEXT.secondary,
                      }}
                    >
                      {result.matchIn === "title"
                        ? renderHighlightedTitle(
                            result.title,
                            result.matchStart,
                            result.matchEnd,
                            accentText,
                          )
                        : result.title}
                    </span>
                    {folderPath && (
                      <span
                        style={{
                          flexShrink: 0,
                          maxWidth: "45%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          color: TEXT.muted,
                        }}
                      >
                        {folderPath}
                      </span>
                    )}
                  </div>
                  {result.snippet ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: TEXT.muted,
                        paddingLeft: 19,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: "16px",
                      }}
                    >
                      {renderSnippet(result.snippet, accentText)}
                    </div>
                  ) : result.matchIn === "title" ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: TEXT.muted,
                        paddingLeft: 19,
                        fontStyle: "italic",
                        lineHeight: "16px",
                      }}
                    >
                      title match
                    </div>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : isMobile && searchMode && searchResults.results.length === 0 ? (
          tagSuggestions && tagSuggestions.length > 0 ? (
            <TagChips
              title={search === "#" ? "All Tags" : "Tags"}
              tags={tagSuggestions}
              limit={30}
              onPick={(tag) => setSearch(`#${tag}`)}
              TEXT={TEXT}
              ACCENT={ACCENT}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                color: TEXT.muted,
              }}
            >
              <div style={{ fontSize: 14 }}>No results for &ldquo;{search}&rdquo;</div>
              <div style={{ fontSize: 12 }}>Try searching with #tags</div>
            </div>
          )
        ) : (
          <>
            {/* One tree under one header. The header is a sibling above the
                tree, never inside it: a header is not a legal child of
                role="tree" (axe aria-required-children, caught by the e2e a11y
                gate). Mobile has no header and keeps its inline rows. */}
            {isMobile ? (
              <div role="tree" aria-label="Notes">
                <div style={{ height: 5 }} />
                {filteredTree.map((f) => renderFolder(f, 0))}
                {/* Desktop's New Folder moved up into the Folders header. */}
                {!search && (
                  <MobileTreeAction
                    label="New Folder"
                    onClick={() => createFolder(null)}
                    paddingLeft={10}
                    TEXT={TEXT}
                    BG={BG}
                    accentColor={accentColor}
                  />
                )}
                {(filteredTree.length > 0 || fNotes.length > 0) && <div style={{ height: 16 }} />}
                {fNotes.map((nId) => renderNote(nId, 0))}
                {/* Desktop's New Note moved up into the primary action group. */}
                {!search && (
                  <MobileTreeAction
                    label="New Note"
                    onClick={() => createNote(null)}
                    paddingLeft={7 + 19}
                    borderLeft="3px solid transparent"
                    TEXT={TEXT}
                    BG={BG}
                    accentColor={accentColor}
                  />
                )}
              </div>
            ) : (
              <>
                {/* The vault header: where you are, and everything that makes
                    something. It is also the root drop target, so it stays
                    put however empty the vault is. Folders come first,
                    alphabetical; root notes follow in the sort preference,
                    exactly as inside a folder — the root is a folder. */}
                {/* The vault row is a title with quiet controls: New folder and
                    Sort, revealed on row hover or focus (held while the Sort
                    menu is open), at the 16px row tier so they read with the
                    folder glyphs below, not with the chrome row above. */}
                {/* New note and the list's controls stay reachable however
                    far the tree is scrolled: they are a sticky block at the
                    top of the sidebar's one scroller, and rows slide under
                    them with no separator (2026-09-12). */}
                <div
                  inert={hiddenControls}
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: chromeBg,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ height: SECTION_GAP }} />
                  <SidebarNewNote onClick={() => createNote(null)} TEXT={TEXT} BG={BG} />
                  <SectionHeader
                    label="Notes"
                    TEXT={TEXT}
                    dropRoot
                    menuOpen={sortMenuAnchor !== null}
                  >
                    <SectionAction
                      onClick={() => createFolder(null)}
                      label="New folder"
                      shortcut={SHORTCUTS.newFolder}
                    >
                      <NewFolderIcon size={16} />
                    </SectionAction>
                    <SectionAction
                      onClick={(e) => setSortMenuAnchor(e.currentTarget.getBoundingClientRect())}
                      label="Sort"
                      aria-haspopup="menu"
                      aria-expanded={sortMenuAnchor !== null}
                      active={sortMenuAnchor !== null}
                    >
                      <SortIcon size={16} />
                    </SectionAction>
                  </SectionHeader>
                </div>
                {sortMenuAnchor && (
                  <SortMenu
                    anchor={sortMenuAnchor}
                    sortMode={sortMode}
                    setSortMode={setSortMode}
                    onClose={closeSortMenu}
                  />
                )}
                {/* An empty tree fails axe, so the element exists only with rows. */}
                {(filteredTree.length > 0 || fNotes.length > 0) && (
                  <div role="tree" aria-label="Notes">
                    {filteredTree.map((f) => renderFolder(f, 0))}
                    {/* No breath before the root notes: the guide line ending
                        says the folder ended; the row rhythm stays even. */}
                    {fNotes.map((nId) => renderNote(nId, 0))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default Sidebar;
