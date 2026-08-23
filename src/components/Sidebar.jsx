import { useEffect, useMemo, useState, memo } from "react";
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
  NewNoteIcon,
  SearchIcon,
  MoreHorizontalIcon,
  SidebarToggleIcon,
  SortAlphaIcon,
  SortRecentIcon,
} from "./Icons";
import SortMenu from "./SortMenu";
import { SORT_RECENT, sortModeLabel } from "../utils/noteSort";
import { CHROME_INSET, CHROME_BTN, ChromeButton } from "./EditorChrome";
import boojyWordmark from "/assets/boojy-notes-wordmark.png";

const hBg = (el, c) => {
  el.style.background = c;
};

// ── Sidebar header geometry ─────────────────────────────────────────────────
// Tweakable in one place: wordmark left, panel toggle right near the divider.
/** Left inset of the wordmark from the sidebar edge. */
const HEADER_LEFT_INSET = 12;
/** Breathing room between the toggle's right edge and the sidebar divider. */
const HEADER_RIGHT_INSET = 12;
/** Optical drop for the whole header row (wordmark + toggle together). */
const HEADER_NUDGE = 4;

// ── Desktop alignment system: one spine, one text column ────────────────────
// Two columns replace the previous six left edges: everything structural
// (wordmark, action icons, section headers, folder icons) sits on SPINE; every
// label (action labels, folder names, root note titles) sits on TEXT_COL. Root
// notes carry no glyph, so a 22px empty gutter keeps their titles aligned with
// folder names at the same navigation tier.
/** Structural spine: left edge of icons/headers, matches HEADER_LEFT_INSET. */
const SPINE = 12;
/** Label column: where every text label in the panel starts. */
const TEXT_COL = 34;
/** Rows are inset this much from both sidebar edges so hover pills breathe. */
const ROW_INSET = 4;
/** Tree pills keep the 4px left inset but run only this far short of the
 *  scrollbar gutter on the right (judged live 2026-08-23). Pairs with the
 *  .sidebar-scroll thumb override in GlobalStyles.jsx. */
const ROW_INSET_RIGHT = 2;
/** Folder-row glyph box on the spine (16px list tier). */
const SPINE_ICON = 16;
/** Gap between a folder glyph and its name = TEXT_COL − SPINE − SPINE_ICON. */
const ICON_GAP = TEXT_COL - SPINE - SPINE_ICON;
/** Action glyphs (New note / Search) run on the 18px navigation tier
 *  (judged 2026-08-19, "icon system C"). The box widens with the glyph and
 *  the gap shrinks, so the left edge stays on SPINE and labels on TEXT_COL. */
const ACTION_ICON = 18;
const ACTION_ICON_GAP = TEXT_COL - SPINE - ACTION_ICON;

// ── Row grammar (desktop) ────────────────────────────────────────────────────
// Picito-style rows: full-width hit areas (minus ROW_INSET), 12px radius,
// neutral BG.hover for hover AND selected, no boxes at rest. Actions are 32px,
// tree rows 30px with a 2px rhythm gap.
const ACTION_ROW_H = 32;
const ACTION_RADIUS = 12;
const TREE_ROW_H = 30;
const TREE_ROW_GAP = 2;
// ···-menu placement, tunable here (judged live 2026-08-23). The menu drops
// just below the note row and grows rightward into the editor, its left edge
// slightly left of the ··· button.
/** Gap between the row's bottom edge and the menu. */
const NOTE_MENU_GAP = 4;
/** How far left of the ··· button's left edge the menu's left edge sits. */
const NOTE_MENU_SHIFT = 8;

// ── Section headers (desktop) ───────────────────────────────────────────────
// Header labels sit on the SPINE with the icons, one step quieter in colour
// (TEXT.secondary) so they read as structure without out-shouting the selected
// row. The trailing button's 16px glyph lands 12px from the right edge,
// mirroring the spine. No chevrons — the sections do not collapse.
//
// One spacing rule for every section: SECTION_GAP above the header, then
// SECTION_CONTENT_GAP down to its first row. `Folders` gets its top gap from the
// action group's own bottom padding, which is set to the same 12.
const SECTION_HEADER_H = 28;
const SECTION_HEADER_LEFT = SPINE;
/** 6px + the 28px button's own 6px glyph inset = the spine's 12px, mirrored right. */
const SECTION_HEADER_RIGHT = 6;
const SECTION_BTN = 28;
const SECTION_GAP = 12;
const SECTION_CONTENT_GAP = 4;
/**
 * Header controls sit quiet until you go looking for them, but never disappear:
 * hover-only reveal costs a keyboard user the control entirely, and this panel
 * is meant to be obvious without a tutorial.
 *
 * The requested 0.4 is not used, because the opacity maths doesn't reach a
 * legible icon from any of our ink tokens — 0.4 of `TEXT.secondary` composites
 * to roughly 2:1 on the DAY ground, under the 3:1 that an icon-only control
 * needs to be identifiable. 0.55 is the faintest value that still clears it.
 * One constant if that reads too loud live.
 */
const SECTION_ACTION_REST = 0.55;

/**
 * A section lid: bold label left, optional single action right.
 * `role="presentation"` keeps it out of the surrounding tree's item list — the
 * text still reads, it just isn't announced as a row.
 */
function SectionHeader({ label, TEXT, first, children, dropRoot }) {
  return (
    <div
      role="presentation"
      // `Notes` doubles as the visible root drop target during a note drag:
      // drop on a folder → into that folder, drop on Notes → back to root.
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
        marginTop: first ? 0 : SECTION_GAP,
        marginBottom: SECTION_CONTENT_GAP,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT.secondary }}>{label}</span>
      {children}
    </div>
  );
}

/**
 * The single trailing control a section header may carry (New folder, Sort).
 * One component so both wear the same geometry and the same rest/hover ink.
 */
function SectionAction({ onClick, title, ariaLabel, TEXT, BG, children, ...rest }) {
  const rest0 = (e) => {
    hBg(e.currentTarget, "transparent");
    e.currentTarget.style.color = TEXT.secondary;
    e.currentTarget.style.opacity = String(SECTION_ACTION_REST);
  };
  const lift = (e) => {
    hBg(e.currentTarget, BG.surface);
    e.currentTarget.style.color = TEXT.primary;
    e.currentTarget.style.opacity = "1";
  };
  return (
    <button
      type="button"
      className="sidebar-section-action"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        width: SECTION_BTN,
        height: SECTION_BTN,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        background: "transparent",
        borderRadius: 6,
        cursor: "pointer",
        color: TEXT.secondary,
        opacity: SECTION_ACTION_REST,
        transition: "background 120ms, color 120ms, opacity 120ms",
      }}
      onMouseEnter={lift}
      onMouseLeave={rest0}
      onFocus={lift}
      onBlur={rest0}
      {...rest}
    >
      {children}
    </button>
  );
}

function ActionRow({ icon, label, onClick, title, TEXT, BG }) {
  return (
    <button
      type="button"
      className="sidebar-action-row"
      onClick={onClick}
      title={title}
      style={{
        width: "100%",
        height: ACTION_ROW_H,
        display: "flex",
        alignItems: "center",
        // Container is inset ROW_INSET, so this lands the glyph box on SPINE
        // and (with ICON_GAP) the label on TEXT_COL.
        padding: `0 8px 0 ${SPINE - ROW_INSET}px`,
        border: "none",
        background: "transparent",
        borderRadius: ACTION_RADIUS,
        cursor: "pointer",
        color: TEXT.secondary,
        fontSize: 14,
        fontWeight: 400,
        fontFamily: "inherit",
        textAlign: "left",
        transition: "background 120ms, color 120ms",
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
      <span
        style={{
          width: ACTION_ICON,
          marginRight: ACTION_ICON_GAP,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

const Sidebar = memo(function Sidebar({
  activeNote,
  toggle,
  openNote,
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
  isMobile,
}) {
  const { accentColor, toggleSidebar } = useLayout();
  const { setSettingsOpen } = useSettings();
  const { theme } = useTheme();
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
    filteredTree,
    fNotes,
    renamingFolder,
    setRenamingFolder,
    searchMode,
    searchResults,
    activeResultIndex,
    navigateResults,
    clearSearch,
    getActiveResult,
    sortMode,
    setSortMode,
  } = useSidebar();

  // Anchor rect of the sort trigger, or null when the menu is closed.
  const [sortAnchor, setSortAnchor] = useState(null);

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
    // Desktop: quiet row grammar — a full-width pill whose title sits on
    // TEXT_COL, level with the folder names; hover, selection and multi-select
    // all use neutral BG.hover, and the active note is distinguished by ink
    // (weight + TEXT.primary), never by accent. The empty gutter left of the
    // title is the TEXT_COL alignment, not a missing icon. Mobile keeps the
    // existing accent-tinted pill grammar untouched.
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
          padding: `12px 16px 12px ${7 + depth * 20 + 19 + 5}px`,
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
          padding: `0 8px 0 ${TEXT_COL - ROW_INSET + depth * 20}px`,
        };
    return (
      <button
        key={nId}
        data-note-id={nId}
        role="treeitem"
        aria-selected={act}
        onClick={handleNoteClick ? (e) => handleNoteClick(nId, e) : () => openNote(nId)}
        className="sidebar-note"
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
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
        >
          {n.title}
        </span>
        {/* Trailing ··· opens the same note menu as right-click. The slot
            always renders so revealing the dots never shifts the title or its
            truncation — only the ink fades (see .sidebar-note-more in
            GlobalStyles). span+role, tabIndex -1: a real button nested in the
            treeitem button is invalid HTML and fails axe nested-interactive;
            the row itself stays the keyboard path (focus reveals the dots,
            right-click opens the menu). */}
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
              // rightward into the editor. useMenuPosition still clamps/flips
              // near the viewport edges. Right-click keeps cursor placement.
              setCtxMenu({
                x: btn.left - NOTE_MENU_SHIFT,
                y: row.bottom + NOTE_MENU_GAP,
                type: "note",
                id: nId,
              });
            }}
            style={{
              // Inline opacity out-specifies the class's hidden rest state.
              opacity: menuOpen ? 1 : undefined,
              width: 24,
              height: 24,
              marginLeft: 4,
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
    return (
      <div key={folderPath}>
        <button
          data-folder-path={folderPath}
          role="treeitem"
          aria-expanded={isOpen}
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
                  padding: `12px 16px 12px ${10 + depth * 20}px`,
                }
              : {
                  width: `calc(100% - ${ROW_INSET + ROW_INSET_RIGHT}px)`,
                  marginLeft: ROW_INSET,
                  marginBottom: TREE_ROW_GAP,
                  height: TREE_ROW_H,
                  boxSizing: "border-box",
                  padding: `0 8px 0 ${SPINE - ROW_INSET + depth * 20}px`,
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
            fontWeight: 500,
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
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameFolder(folderPath, e.target.value.trim());
                setRenamingFolder(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  renameFolder(folderPath, e.target.value.trim());
                  setRenamingFolder(null);
                }
                if (e.key === "Escape") setRenamingFolder(null);
              }}
              style={{
                background: BG.darkest,
                border: `1px solid ${accentColor}`,
                borderRadius: 4,
                color: TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                fontWeight: 500,
                padding: "1px 4px",
                outline: "none",
                width: "100%",
              }}
            />
          ) : (
            <span
              style={{
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {folder.name}
            </span>
          )}
        </button>
        {isOpen && (
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                // Centred under the folder icon (16px glyph on the SPINE on
                // desktop; 10px inset on mobile).
                left: (isMobile ? 10 : SPINE) + depth * 20 + 8,
                top: 0,
                bottom: 0,
                width: 1,
                background: BG.divider,
              }}
            />
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {folder.notes.map((nId) => renderNote(nId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // On desktop the Search action row swaps into a field once search is engaged;
  // mobile always shows the field.
  const searchActive = Boolean(searchFocused || search);

  const searchInput = (
    <input
      ref={searchInputRef}
      type="text"
      autoFocus={!isMobile}
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
        fontSize: isMobile ? 15 : 14,
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
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Sidebar header: wordmark left, panel toggle right near the divider. */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: CHROME_INSET + CHROME_BTN,
            boxSizing: "border-box",
            // Children are centred, so top padding shifts them by half of it.
            // Height is unchanged, so nothing below the header moves.
            paddingTop: HEADER_NUDGE * 2,
            paddingLeft: HEADER_LEFT_INSET,
            paddingRight: HEADER_RIGHT_INSET,
            flexShrink: 0,
          }}
        >
          <button
            data-testid="wordmark-settings-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Notes — open Settings"
            title="Settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <img src={boojyWordmark} alt="" style={{ height: 20 }} draggable="false" />
          </button>
          <ChromeButton onClick={toggleSidebar} title="Hide sidebar">
            <SidebarToggleIcon />
          </ChromeButton>
        </div>
      )}

      {/* Primary actions \u2014 desktop only. Mobile keeps its search pill below. */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: `4px ${ROW_INSET}px 12px ${ROW_INSET}px`,
            flexShrink: 0,
          }}
        >
          <ActionRow
            icon={<NewNoteIcon size={ACTION_ICON} />}
            label="New note"
            title="New note"
            onClick={() => createNote(null)}
            TEXT={TEXT}
            BG={BG}
          />
          {searchActive ? (
            // Same row geometry as the action rows, so opening search doesn't
            // shift the group \u2014 the row just gains a field and a surface.
            <div
              onClick={() => searchInputRef.current?.focus()}
              style={{
                display: "flex",
                alignItems: "center",
                height: ACTION_ROW_H,
                borderRadius: ACTION_RADIUS,
                boxSizing: "border-box",
                background: theme.searchInputBg,
                border: `1px solid ${searchFocused ? `${accentColor}60` : BG.divider}`,
                paddingRight: 8,
                cursor: "text",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  // −1 compensates the field's 1px border so the glyph stays
                  // on the spine and the input text on TEXT_COL.
                  width: ACTION_ICON,
                  marginLeft: SPINE - ROW_INSET - 1,
                  marginRight: ACTION_ICON_GAP,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TEXT.muted,
                }}
              >
                <SearchIcon size={ACTION_ICON} />
              </span>
              {searchInput}
              {clearSearchButton}
            </div>
          ) : (
            <ActionRow
              icon={<SearchIcon size={ACTION_ICON} />}
              label="Search"
              title="Search notes"
              onClick={() => {
                setSearchFocused(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              TEXT={TEXT}
              BG={BG}
            />
          )}
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

      {/* Search results or File tree */}
      {searchMode && searchResults.results.length > 0 ? (
        <div
          ref={sidebarScrollRef}
          className="sidebar-scroll"
          style={{ flex: 1, overflow: "auto", padding: "2px 0" }}
        >
          {tagSuggestions && tagSuggestions.length > 0 && (
            <div style={{ padding: "4px 14px 8px" }}>
              <div
                style={{
                  fontSize: 11,
                  color: TEXT.muted,
                  fontWeight: 500,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Tags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {tagSuggestions.slice(0, 20).map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => setSearch(`#${t.tag}`)}
                    style={{
                      background: `${ACCENT.primary}15`,
                      color: ACCENT.primary,
                      border: "none",
                      borderRadius: 10,
                      padding: "2px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${ACCENT.primary}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${ACCENT.primary}15`;
                    }}
                  >
                    <span>#{t.tag}</span>
                    <span style={{ color: TEXT.muted, fontSize: 10 }}>{t.count}</span>
                  </button>
                ))}
              </div>
              {searchResults.results.length > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: TEXT.muted,
                    fontWeight: 500,
                    marginTop: 10,
                    marginBottom: 2,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Notes
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, color: TEXT.muted, padding: "4px 14px 8px" }}>
            {searchResults.totalCount <= 20
              ? `${searchResults.totalCount} result${searchResults.totalCount !== 1 ? "s" : ""}`
              : `Showing 20 of ${searchResults.totalCount}`}
          </div>
          {searchResults.groups.map((group) => (
            <div key={group.folderId || "_root"}>
              {group.folderName && (
                <div
                  style={{
                    fontSize: 11,
                    color: TEXT.muted,
                    padding: "8px 14px 2px",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{group.folderName}</span>
                  <div style={{ flex: 1, height: 1, background: BG.divider }} />
                </div>
              )}
              {group.results.map((result) => {
                const isActive = result._globalIndex === activeResultIndex;
                return (
                  <button
                    key={result.noteId}
                    data-search-index={result._globalIndex}
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
                              accentColor,
                            )
                          : result.title}
                      </span>
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
                        {renderSnippet(result.snippet, accentColor)}
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
            </div>
          ))}
        </div>
      ) : searchMode && searchResults.results.length === 0 ? (
        tagSuggestions && tagSuggestions.length > 0 ? (
          <div
            ref={sidebarScrollRef}
            className="sidebar-scroll"
            style={{ flex: 1, overflow: "auto", padding: "2px 0" }}
          >
            <div style={{ padding: "4px 14px 8px" }}>
              <div
                style={{
                  fontSize: 11,
                  color: TEXT.muted,
                  fontWeight: 500,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {search === "#" ? "All Tags" : "Tags"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {tagSuggestions.slice(0, 30).map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => setSearch(`#${t.tag}`)}
                    style={{
                      background: `${ACCENT.primary}15`,
                      color: ACCENT.primary,
                      border: "none",
                      borderRadius: 10,
                      padding: "2px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${ACCENT.primary}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${ACCENT.primary}15`;
                    }}
                  >
                    <span>#{t.tag}</span>
                    <span style={{ color: TEXT.muted, fontSize: 10 }}>{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
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
          <div
            ref={sidebarScrollRef}
            className="sidebar-scroll"
            onPointerDown={handleSidebarPointerDown}
            style={{
              flex: 1,
              overflow: "auto",
              padding: isMobile ? "2px 0" : "0 0 2px",
            }}
          >
            {/* Two labelled trees, not one: a section header — and the New folder
                button inside it — is not a legal child of role="tree" (axe
                aria-required-children, caught by the e2e a11y gate). Mobile has no
                headers, so it keeps a single tree with its own inline rows. */}
            {isMobile ? (
              <div role="tree" aria-label="Notes">
                <div style={{ height: 5 }} />
                {filteredTree.map((f) => renderFolder(f, 0))}
                {/* Desktop's New Folder moved up into the Folders header. */}
                {!search && isMobile && (
                  <button
                    onClick={createFolder}
                    role="treeitem"
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      background: "transparent",
                      padding: isMobile ? "12px 16px 12px 10px" : `4px 10px 4px 10px`,
                      display: "flex",
                      alignItems: "center",
                      gap: isMobile ? 8 : 5,
                      color: TEXT.secondary,
                      fontSize: isMobile ? 17 : 14,
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
                    <span
                      style={{ width: 17, flexShrink: 0, textAlign: "center", color: accentColor }}
                    >
                      +
                    </span>
                    <span>New Folder</span>
                  </button>
                )}
                {(filteredTree.length > 0 || fNotes.length > 0) && <div style={{ height: 16 }} />}
                {fNotes.map((nId) => renderNote(nId, 0))}
                {/* Desktop's New Note moved up into the primary action group. */}
                {!search && isMobile && (
                  <button
                    onClick={() => createNote(null)}
                    role="treeitem"
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      background: "transparent",
                      borderLeft: "3px solid transparent",
                      padding: `12px 16px 12px ${7 + 19}px`,
                      display: "flex",
                      alignItems: "center",
                      gap: isMobile ? 8 : 5,
                      color: TEXT.secondary,
                      fontSize: isMobile ? 17 : 14,
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
                    <span
                      style={{ width: 17, flexShrink: 0, textAlign: "center", color: accentColor }}
                    >
                      +
                    </span>
                    <span>New Note</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <SectionHeader label="Folders" TEXT={TEXT} first>
                  <SectionAction onClick={createFolder} title="New folder" TEXT={TEXT} BG={BG}>
                    <NewFolderIcon />
                  </SectionAction>
                </SectionHeader>
                {filteredTree.length > 0 && (
                  <div role="tree" aria-label="Folders">
                    {filteredTree.map((f) => renderFolder(f, 0))}
                  </div>
                )}
                {/* The header stays put when the section is empty: it is both the
                    visible root drop target and the home of the sort control, and
                    those are needed exactly when there are no root notes to show.
                    A search that matches no root note is the one case it hides. */}
                {(!search || fNotes.length > 0) && (
                  <>
                    <SectionHeader label="Notes" TEXT={TEXT} dropRoot>
                      <SectionAction
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setSortAnchor((prev) =>
                            prev
                              ? null
                              : { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
                          );
                        }}
                        title="Sort notes"
                        ariaLabel={`Sort notes: ${sortModeLabel(sortMode)}`}
                        aria-haspopup="menu"
                        aria-expanded={!!sortAnchor}
                        TEXT={TEXT}
                        BG={BG}
                      >
                        {sortMode === SORT_RECENT ? <SortRecentIcon /> : <SortAlphaIcon />}
                      </SectionAction>
                    </SectionHeader>
                    {fNotes.length > 0 && (
                      <div role="tree" aria-label="Notes">
                        {fNotes.map((nId) => renderNote(nId, 0))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
      {sortAnchor && (
        <SortMenu
          anchorRect={sortAnchor}
          mode={sortMode}
          onSelect={setSortMode}
          onClose={() => setSortAnchor(null)}
        />
      )}
    </div>
  );
});

export default Sidebar;

// Helper: render title with highlighted match portion
function renderHighlightedTitle(title, matchStart, matchEnd, accentColor) {
  if (matchStart < 0 || matchEnd <= matchStart) return title;
  return (
    <>
      {title.slice(0, matchStart)}
      <span style={{ color: accentColor, fontWeight: 600 }}>
        {title.slice(matchStart, matchEnd)}
      </span>
      {title.slice(matchEnd)}
    </>
  );
}

// Helper: render snippet with highlighted match text
function renderSnippet(snippet, accentColor) {
  if (!snippet) return null;
  const { text, highlightStart, highlightEnd } = snippet;
  if (highlightStart < 0 || highlightEnd <= highlightStart || highlightStart >= text.length)
    return text;
  return (
    <>
      {text.slice(0, highlightStart)}
      <span style={{ color: accentColor, fontWeight: 600 }}>
        {text.slice(highlightStart, highlightEnd)}
      </span>
      {text.slice(highlightEnd)}
    </>
  );
}
