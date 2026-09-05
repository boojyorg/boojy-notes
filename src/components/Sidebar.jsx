import { useEffect, useMemo, useRef, useState, memo } from "react";
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
  SidebarToggleIcon,
} from "./Icons";
import { CHROME_TOP, CHROME_BTN, MAC_TRAFFIC_INSET, ChromeButton } from "./EditorChrome";
import VaultMenu from "./VaultMenu";
import { isElectronMac } from "../utils/platform";
import boojyWordmark from "/assets/boojy-notes-wordmark.png";

const hBg = (el, c) => {
  el.style.background = c;
};

/** Duration of the folder expand/collapse slide. */
const FOLDER_ANIM_MS = 160;

// Animated disclosure for folder children. The grid 0fr→1fr trick animates to
// auto height with no measuring. Children MUST unmount once the collapse
// finishes (not merely clip): useSidebarDrag hit-tests every [data-folder-path]
// row by rect, and clipped-but-mounted rows would swallow drops meant for the
// visible rows they overlap. Expand mounts at 0fr and flips to 1fr on the next
// frames so the first open animates too. Reduced-motion users skip the
// animation entirely (mount/unmount is instant, as before the animation).
function Collapsible({ open, children }) {
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [mounted, setMounted] = useState(open);
  const [grown, setGrown] = useState(open);
  const rafRef = useRef(null);
  useEffect(() => {
    if (open) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setGrown(true));
      });
    } else {
      setGrown(false);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [open]);
  if (reduceMotion) return open ? children : null;
  if (!mounted && !open) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: grown ? "1fr" : "0fr",
        transition: `grid-template-rows ${FOLDER_ANIM_MS}ms ease`,
      }}
      onTransitionEnd={(e) => {
        // Guard on target: a child row's own background/color transition
        // bubbling up must not unmount the subtree mid-collapse.
        if (!open && e.target === e.currentTarget) setMounted(false);
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ── Sidebar header geometry ─────────────────────────────────────────────────
// Tweakable in one place: wordmark left, panel toggle right near the divider.
/** Left inset of the wordmark from the sidebar edge. */
const HEADER_LEFT_INSET = 12;
/** Breathing room between the toggle's right edge and the sidebar divider. */
const HEADER_RIGHT_INSET = 6;
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

// ── Row grammar (desktop) ────────────────────────────────────────────────────
// Picito-style rows: full-width hit areas (minus ROW_INSET), 12px radius,
// neutral BG.hover for hover AND selected, no boxes at rest. Tree rows are
// 28px with a 2px rhythm gap; the vault header is the same height.
const ACTION_RADIUS = 12;
const TREE_ROW_H = 28;
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
const SECTION_HEADER_H = TREE_ROW_H;
const SECTION_HEADER_LEFT = SPINE;
/** The header's 16px glyphs share a right edge with the chrome row's 18px ones:
 *  HEADER_RIGHT_INSET (12) + the chrome glyph's 7px inset − this row's 8px. */
const SECTION_HEADER_RIGHT = 5;
/** Header controls share the chrome row's 32px hit box and 18px nav glyph. */
const SECTION_BTN = 32;
const SECTION_GAP = 12;
const SECTION_CONTENT_GAP = 2;
// Header controls hide at rest and reveal on header hover / keyboard focus,
// mirroring the note-row ··· grammar (judged live 2026-08-23 — this reversed
// the earlier always-visible-at-0.55 rule). All rest/reveal/emphasis states
// are CSS (.sidebar-section-action in GlobalStyles); keyboard users are never
// locked out (focus reveals), and touch devices keep the controls visible.

/**
 * The one section lid: the vault's name left, its controls right.
 * `role="presentation"` keeps it out of the tree below — the text still
 * reads, it just isn't announced as a row. The name is the vault folder's
 * basename, quiet secondary ink: it says where you are, nothing more.
 */
function SectionHeader({ label, TEXT, first, children, dropRoot }) {
  return (
    <div
      role="presentation"
      className="sidebar-section-header"
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
 * A trailing header control (New note, New folder, ···). One component so
 * all wear the same geometry and the same rest/hover ink. `visible` keeps
 * the control on screen at rest (muted) instead of hover-revealed; the vault
 * header's three are, because New note cannot be a secret. Never a fourth:
 * three muted glyphs read as a set, four read as a toolbar.
 */
function SectionAction({ onClick, title, ariaLabel, active, visible, children, ...rest }) {
  return (
    <button
      type="button"
      className={`sidebar-section-action${visible ? " sidebar-section-action--visible" : ""}`}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        // Rest/reveal/emphasis ink lives in CSS; inline opacity holds the
        // control visible while its menu is open (inline wins over the class).
        opacity: active ? 1 : undefined,
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
    >
      {children}
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

/** Small-caps heading used by the search views ("Tags", "Notes"). */
const SEARCH_HEADING = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

/**
 * Tag chips for a `#` search, under a heading; `children` lands inside the
 * same padded block (the results view appends its "Notes" heading there).
 */
function TagChips({ title, tags, limit, onPick, TEXT, ACCENT, children }) {
  return (
    <div style={{ padding: "4px 14px 8px" }}>
      <div style={{ ...SEARCH_HEADING, color: TEXT.muted, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tags.slice(0, limit).map((t) => (
          <button
            key={t.tag}
            onClick={() => onPick(t.tag)}
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
      {children}
    </div>
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
  isMobile,
  // The vault folder's basename ("Notes" on web, where there is no folder).
  vaultName = "Notes",
  // Desktop only: the ··· menu's whole-vault actions.
  onRevealVault,
  onChangeVault,
}) {
  const { accentColor, chromeBg, toggleSidebar } = useLayout();
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
  const [vaultMenuAnchor, setVaultMenuAnchor] = useState(null);
  const closeVaultMenu = () => setVaultMenuAnchor(null);
  const collapseAllFolders = () => setExpanded({});

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
        // Double-click = rename in place: the row swaps its title for the same
        // inline input folders use. The two single-clicks it also fires just
        // open the note, harmlessly.
        onDoubleClick={!isMobile && renamingNote !== nId ? () => setRenamingNote(nId) : undefined}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameNote(nId, e.target.value);
                setRenamingNote(null);
              }
              if (e.key === "Escape") setRenamingNote(null);
            }}
            style={{
              background: BG.darkest,
              border: `1px solid ${accentColor}`,
              borderRadius: 4,
              color: TEXT.primary,
              fontSize: mobFont,
              fontFamily: "inherit",
              fontWeight: 400,
              padding: "1px 4px",
              outline: "none",
              flex: 1,
              minWidth: 0,
            }}
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
    return (
      <div key={folderPath}>
        <button
          data-folder-path={folderPath}
          role="treeitem"
          aria-expanded={isOpen}
          onClick={(e) => {
            // Desktop double-click renames: the second click is the rename
            // gesture, so it must not toggle again — the first click's toggle
            // stands (an open folder behind a rename input is fine; a laggy
            // single-click from a disambiguation delay would not be).
            if (!isMobile && e.detail >= 2) return;
            toggle(folderPath);
          }}
          onDoubleClick={!isMobile ? () => setRenamingFolder(folderPath) : undefined}
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
              onClick={(e) => e.stopPropagation()}
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
                  e.currentTarget.dataset.committed = "1";
                  renameFolder(folderPath, e.currentTarget.value.trim());
                  setRenamingFolder(null);
                }
                if (e.key === "Escape") {
                  e.currentTarget.dataset.committed = "1";
                  setRenamingFolder(null);
                }
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
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {folder.name}
            </span>
          )}
        </button>
        {hasChildren && (
          <Collapsible open={isOpen}>
            {/* LIVE TRY 2026-09-05: an indent guide, a hairline dropping from
                the folder glyph's centre through its children. In one mixed
                tree, root notes (no glyph, text on the folder-label column)
                otherwise read as children of the last open folder above them;
                the line ending is what says "this folder ends here". */}
            <div style={{ position: "relative" }}>
              {!isMobile && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: TREE_ROW_GAP,
                    left: SPINE + SPINE_ICON / 2 + depth * 20,
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
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Sidebar header: wordmark left, panel toggle right near the divider.
          On macOS Electron the native traffic lights sit in this row too
          (hiddenInset, no title bar): the wordmark shifts right to clear them
          and the whole header doubles as the window drag region — the wordmark
          and toggle opt back out so they stay clickable. */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: CHROME_TOP + CHROME_BTN,
            boxSizing: "border-box",
            // Children are centred, so top padding shifts them by half of it.
            // Height is unchanged, so nothing below the header moves.
            paddingTop: HEADER_NUDGE * 2,
            paddingLeft: isElectronMac ? MAC_TRAFFIC_INSET : HEADER_LEFT_INSET,
            paddingRight: HEADER_RIGHT_INSET,
            flexShrink: 0,
            WebkitAppRegion: isElectronMac ? "drag" : undefined,
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
              WebkitAppRegion: "no-drag",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {/* 18px: a label, not a headline — at 20 it out-shouted the note's H1.
                LIVE TRY 2026-09-05: the asset is pure black, the heaviest ink in
                the window; 0.92 lands it near TEXT.primary (#14110F). A re-drawn
                asset in the ink colour is the real fix if this stays. */}
            <img
              src={boojyWordmark}
              alt=""
              style={{ height: 18, opacity: 0.92 }}
              draggable="false"
            />
          </button>
          {/* Window-level controls live in the chrome row with the traffic
              lights: Search and the panel toggle. The vault header below is
              the first content line. Search reveals the field until the
              search palette (Cmd+K) replaces it. */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <ChromeButton
              onClick={() => {
                setSearchFocused(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              title="Search"
            >
              <SearchIcon size={18} />
            </ChromeButton>
            <ChromeButton onClick={toggleSidebar} title="Hide sidebar">
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
        {!isMobile && (searchFocused || search) && (
          <div
            style={{
              // Sticky, not fixed: pinned while the tree scrolls beneath.
              // chromeBg keeps rows from ghosting through; matches the panel.
              position: "sticky",
              top: 0,
              zIndex: 1,
              background: chromeBg,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: `4px ${ROW_INSET}px 8px ${ROW_INSET}px`,
              flexShrink: 0,
            }}
          >
            {/* The search field appears only while searching, opened from the
                chrome row's Search glyph; at rest the vault header is the
                first line of the panel. Interim until the Cmd+K palette. */}
            <div
              onClick={() => searchInputRef.current?.focus()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                margin: "0 4px",
                borderRadius: 14,
                boxSizing: "border-box",
                background: BG.surface,
                border: `1px solid ${searchFocused ? `${accentColor}60` : "transparent"}`,
                padding: "0 10px 0 9px",
                cursor: "text",
                overflow: "hidden",
                transition: "border-color 0.15s ease",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", flexShrink: 0, color: TEXT.muted }}
              >
                <SearchIcon size={14} />
              </span>
              {searchInput}
              {clearSearchButton}
            </div>
          </div>
        )}
        {searchMode && searchResults.results.length > 0 ? (
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
          </>
        ) : searchMode && searchResults.results.length === 0 ? (
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
                    the ··· reveal on hover or focus, at the 16px row tier so
                    they read with the folder glyphs below, not with the chrome
                    row above. New note lives in the chrome row. */}
                <SectionHeader label={vaultName} TEXT={TEXT} first dropRoot>
                  <SectionAction onClick={() => createFolder(null)} title="New folder">
                    <NewFolderIcon size={16} />
                  </SectionAction>
                  <SectionAction
                    onClick={(e) => setVaultMenuAnchor(e.currentTarget.getBoundingClientRect())}
                    title="Vault options"
                    aria-haspopup="menu"
                    aria-expanded={vaultMenuAnchor !== null}
                    active={vaultMenuAnchor !== null}
                  >
                    <MoreHorizontalIcon size={16} />
                  </SectionAction>
                </SectionHeader>
                {vaultMenuAnchor && (
                  <VaultMenu
                    anchor={vaultMenuAnchor}
                    sortMode={sortMode}
                    setSortMode={setSortMode}
                    onCollapseAll={collapseAllFolders}
                    onNewFolder={() => createFolder(null)}
                    onReveal={onRevealVault}
                    onChangeVault={onChangeVault}
                    revealLabel={isElectronMac ? "Reveal in Finder" : "Show in folder"}
                    onClose={closeVaultMenu}
                  />
                )}
                {/* An empty tree fails axe, so the element exists only with rows. */}
                {(filteredTree.length > 0 || fNotes.length > 0) && (
                  <div role="tree" aria-label={vaultName}>
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
