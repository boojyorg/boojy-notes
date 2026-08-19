import { useEffect, useMemo, useRef, memo } from "react";
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
  SidebarToggleIcon,
} from "./Icons";
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

// ── Primary action rows (desktop) ───────────────────────────────────────────
// Geometry ported from Picito's New chat / Search rows: a 32px row with a fixed
// 32px centred icon column, so both labels start on the same optical line and
// the icons stay put whatever their glyph size. These are actions, not nav rows,
// so there is no selected state — hover only.
const ACTION_ROW_H = 32;
const ACTION_ICON_COL = 32;
const ACTION_RADIUS = 12;

// ── Section headers (desktop) ───────────────────────────────────────────────
// Picito's Projects header, re-aligned to Boojy's sidebar grid: the label sits
// on the folder rows' 10px left inset and any trailing button's 16px glyph lands
// on their 10px right inset, so headers read as lids on the tree rather than a
// third left edge. No chevrons — the sections do not collapse.
//
// One spacing rule for every section: SECTION_GAP above the header, then
// SECTION_CONTENT_GAP down to its first row. `Folders` gets its top gap from the
// action group's own bottom padding, which is set to the same 12.
const SECTION_HEADER_H = 28;
const SECTION_HEADER_LEFT = 10;
/** 6px + the button's own 4px glyph inset = the folder rows' 10px right inset. */
const SECTION_HEADER_RIGHT = 6;
const SECTION_BTN = 24;
const SECTION_GAP = 12;
const SECTION_CONTENT_GAP = 4;

/**
 * A section lid: bold label left, optional single action right.
 * `role="presentation"` keeps it out of the surrounding tree's item list — the
 * text still reads, it just isn't announced as a row.
 */
function SectionHeader({ label, TEXT, first, children }) {
  return (
    <div
      role="presentation"
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
      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT.primary }}>{label}</span>
      {children}
    </div>
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
        padding: `0 8px 0 0`,
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
          width: ACTION_ICON_COL,
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
  isMobile,
}) {
  const { sidebarWidth, accentColor, selectionStyle, setCollapsed } = useLayout();
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
  } = useSidebar();

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
    const mobVPad = isMobile ? 12 : 4;
    const mobFont = isMobile ? 17 : 14;
    const mobGap = isMobile ? 9 : 5;
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
          width: selectionStyle === "B" ? "calc(100% - 8px)" : "calc(100% + 2px)",
          marginTop: 0,
          marginBottom: 0,
          marginLeft: selectionStyle === "B" ? 5 : -1,
          marginRight: selectionStyle === "B" ? 3 : 0,
          border: "none",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: "pointer",
          background: act
            ? `${accentColor}${selectionStyle === "B" ? "30" : "15"}`
            : sel
              ? `${accentColor}${selectionStyle === "B" ? "18" : "0A"}`
              : "transparent",
          borderRadius: selectionStyle === "B" ? 6 : 0,
          ...(selectionStyle === "A"
            ? {
                borderLeft: act
                  ? `3px solid ${accentColor}`
                  : sel
                    ? `2px solid ${accentColor}60`
                    : "3px solid transparent",
              }
            : {}),
          // The removed FileIcon's width + gap is folded into the left padding so
          // titles keep their column: they still line up with the folder names
          // above them instead of jumping left by a glyph. The chevron removal
          // took its width + gap (21 desktop / 24 mobile) back out of both rows.
          padding: `${mobVPad}px ${isMobile ? 16 : 10}px ${mobVPad}px ${7 + depth * 20 + 19 + (isMobile ? 5 : 0)}px`,
          display: "flex",
          alignItems: "center",
          gap: mobGap,
          color: act || sel ? TEXT.primary : TEXT.secondary,
          fontSize: mobFont,
          fontFamily: "inherit",
          fontWeight: act ? 600 : 400,
          transition: "background 0.12s",
          textAlign: "left",
          boxShadow:
            selectionStyle === "A" && act ? `inset 4px 0 12px -4px ${ACCENT.primary}30` : "none",
        }}
        onMouseEnter={(e) => {
          if (!act && !sel) hBg(e.currentTarget, BG.hover);
          else if (sel && !act) hBg(e.currentTarget, `${accentColor}22`);
        }}
        onMouseLeave={(e) => {
          if (!act && !sel) hBg(e.currentTarget, "transparent");
          else if (sel && !act)
            hBg(e.currentTarget, `${accentColor}${selectionStyle === "B" ? "18" : "0A"}`);
        }}
      >
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
        >
          {n.title}
        </span>
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
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: `${isMobile ? 12 : 4}px ${isMobile ? 16 : 10}px ${isMobile ? 12 : 4}px ${10 + depth * 20}px`,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 8 : 5,
            color: TEXT.secondary,
            fontSize: isMobile ? 17 : 14,
            fontWeight: 500,
            fontFamily: "inherit",
            transition: "background 0.12s, color 0.12s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            hBg(e.currentTarget, BG.elevated);
            e.currentTarget.style.color = TEXT.primary;
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
        >
          {/* No disclosure chevron — the whole row toggles, the open-folder icon
              and indented children carry the state. aria-expanded still announces
              it. (Reversible experiment: restore the chevron + placeholder span
              here and the chevron allowance in renderNote's left padding.) */}
          <FolderIcon open={isOpen} color={accentColor} size={isMobile ? 20 : undefined} />
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
                // Centred under the folder icon (16px glyph at 10px inset).
                left: 10 + depth * 20 + 8,
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
      {/* Sidebar header: wordmark left, panel toggle right (near the divider).
          Revert path — restore `paddingLeft: CHROME_LEFT_GUTTER`, drop the
          ChromeButton below, and un-guard the fixed toggle in EditorChrome. */}
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
          <ChromeButton onClick={() => setCollapsed(true)} title="Hide sidebar">
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
            padding: "4px 3px 12px 8px",
            flexShrink: 0,
          }}
        >
          <ActionRow
            icon={<NewNoteIcon size={18} />}
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
                  width: ACTION_ICON_COL - 1,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TEXT.muted,
                }}
              >
                <SearchIcon />
              </span>
              {searchInput}
              {clearSearchButton}
            </div>
          ) : (
            <ActionRow
              icon={<SearchIcon />}
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
        <div ref={sidebarScrollRef} style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
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
          <div ref={sidebarScrollRef} style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
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
                  <button
                    type="button"
                    className="sidebar-section-action"
                    onClick={createFolder}
                    title="New folder"
                    aria-label="New folder"
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
                      color: TEXT.muted,
                      transition: "background 120ms, color 120ms",
                    }}
                    onMouseEnter={(e) => {
                      hBg(e.currentTarget, BG.surface);
                      e.currentTarget.style.color = TEXT.primary;
                    }}
                    onMouseLeave={(e) => {
                      hBg(e.currentTarget, "transparent");
                      e.currentTarget.style.color = TEXT.muted;
                    }}
                  >
                    <NewFolderIcon />
                  </button>
                </SectionHeader>
                {filteredTree.length > 0 && (
                  <div role="tree" aria-label="Folders">
                    {filteredTree.map((f) => renderFolder(f, 0))}
                  </div>
                )}
                {fNotes.length > 0 && (
                  <>
                    <SectionHeader label="Notes" TEXT={TEXT} />
                    <div role="tree" aria-label="Notes">
                      {fNotes.map((nId) => renderNote(nId, 0))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
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
