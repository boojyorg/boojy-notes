import { useEffect, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { ChevronRight, ChevronDown, FolderIcon, FileIcon, SearchIcon, TrashIcon } from "./Icons";

const hBg = (el, c) => {
  el.style.background = c;
};

const Sidebar = memo(function Sidebar({
  search,
  setSearch,
  searchFocused,
  setSearchFocused,
  searchInputRef,
  sidebarWidth,
  accentColor,
  selectionStyle,
  filteredTree,
  fNotes,
  noteData,
  activeNote,
  expanded,
  toggle,
  openNote,
  setCtxMenu,
  renamingFolder,
  setRenamingFolder,
  renameFolder,
  createFolder,
  createNote,
  handleSidebarPointerDown,
  sidebarScrollRef,
  trashedNotes,
  trashExpanded,
  setTrashExpanded,
  emptyAllTrash,
  restoreNote,
  permanentDeleteNote,
  searchMode,
  searchResults,
  activeResultIndex,
  navigateResults,
  clearSearch,
  handleSearchResultOpen,
  getActiveResult,
  selectedNotes,
  handleNoteClick,
  clearSelection,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT, SEMANTIC } = theme;

  // Render a note row at given depth
  const renderNote = (nId, depth) => {
    const n = noteData[nId];
    if (!n || n._draft) return null;
    const act = activeNote === nId;
    const sel = selectedNotes?.has(nId);
    return (
      <button
        key={nId}
        data-note-id={nId}
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
          padding:
            selectionStyle === "B"
              ? `4px 10px 4px ${7 + depth * 20 + 19}px`
              : `4px 10px 4px ${7 + depth * 20 + 19}px`,
          display: "flex",
          alignItems: "center",
          gap: 5,
          color: act || sel ? TEXT.primary : TEXT.secondary,
          fontSize: 14,
          fontFamily: "inherit",
          fontWeight: act ? 600 : 400,
          transition: "background 0.12s",
          textAlign: "left",
          boxShadow:
            selectionStyle === "A" && act ? `inset 4px 0 12px -4px ${ACCENT.primary}30` : "none",
        }}
        onMouseEnter={(e) => {
          if (!act && !sel) hBg(e.currentTarget, BG.elevated);
          else if (sel && !act) hBg(e.currentTarget, `${accentColor}22`);
        }}
        onMouseLeave={(e) => {
          if (!act && !sel) hBg(e.currentTarget, "transparent");
          else if (sel && !act)
            hBg(e.currentTarget, `${accentColor}${selectionStyle === "B" ? "18" : "0A"}`);
        }}
      >
        <FileIcon active={act || sel} />
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
    const isOpen = expanded[folderPath];
    const hasChildren = folder.children.length > 0 || folder.notes.length > 0;
    return (
      <div key={folderPath}>
        <button
          data-folder-path={folderPath}
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
            padding: `4px 10px 4px ${10 + depth * 20}px`,
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: TEXT.secondary,
            fontSize: 14,
            fontWeight: 400,
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
          {hasChildren ? (
            isOpen ? (
              <ChevronDown />
            ) : (
              <ChevronRight />
            )
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          <FolderIcon open={isOpen} color={accentColor} />
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
                left: 10 + depth * 20 + 7,
                top: 0,
                bottom: 0,
                width: 1,
                background: "rgba(58, 61, 74, 0.4)",
              }}
            />
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {folder.notes.map((nId) => renderNote(nId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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
      {/* Search */}
      <div style={{ padding: "8px 10px" }}>
        <div
          onClick={() => {
            if (!searchFocused && !search) {
              setSearchFocused(true);
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: theme.searchInputBg,
            borderRadius: 14,
            height: 28,
            width: searchFocused || search ? sidebarWidth - 20 : 95,
            padding: "0 10px",
            border: `1px solid ${searchFocused ? `${accentColor}60` : BG.divider}`,
            transition: "width 0.2s ease, border-color 0.2s ease",
            cursor: searchFocused || search ? "text" : "pointer",
            overflow: "hidden",
          }}
        >
          <SearchIcon />
          {searchFocused || search ? (
            <input
              ref={searchInputRef}
              type="text"
              autoFocus
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
                fontSize: 13,
                width: "100%",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <span style={{ color: TEXT.muted, fontSize: 13, fontWeight: 500, userSelect: "none" }}>
              Search
            </span>
          )}
          {search && (
            <button
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
              {"\u2715"}
            </button>
          )}
        </div>
      </div>

      {/* Search results or File tree */}
      {searchMode && searchResults.results.length > 0 ? (
        <div ref={sidebarScrollRef} style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
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
                      if (!isActive) hBg(e.currentTarget, BG.elevated);
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
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TEXT.muted,
            fontSize: 13,
          }}
        >
          No notes found
        </div>
      ) : (
        <>
          <div
            ref={sidebarScrollRef}
            onPointerDown={handleSidebarPointerDown}
            style={{
              flex: 1,
              overflow: "auto",
              padding: "2px 0",
            }}
          >
            <div style={{ height: 5 }} />
            {filteredTree.map((f) => renderFolder(f, 0))}
            {!search && (
              <button
                onClick={createFolder}
                style={{
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  background: "transparent",
                  padding: `4px 10px 4px 10px`,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: TEXT.secondary,
                  fontSize: 14,
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
                <span style={{ width: 14, flexShrink: 0 }} />
                <span style={{ width: 17, flexShrink: 0, textAlign: "center" }}>+</span>
                <span>New Folder</span>
              </button>
            )}
            {(filteredTree.length > 0 || fNotes.length > 0) && <div style={{ height: 16 }} />}
            {fNotes.map((nId) => renderNote(nId, 0))}
            {!search && (
              <button
                onClick={() => createNote(null)}
                style={{
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  background: "transparent",
                  borderLeft: "3px solid transparent",
                  padding: `4px 10px 4px ${7 + 19}px`,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: TEXT.secondary,
                  fontSize: 14,
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
                <span style={{ width: 17, flexShrink: 0, textAlign: "center" }}>+</span>
                <span>New Note</span>
              </button>
            )}
          </div>

          {/* Trash Section */}
          {!search && (
            <div style={{ borderTop: `1px solid ${BG.divider}`, padding: "4px 0" }}>
              <button
                onClick={() => setTrashExpanded((prev) => !prev)}
                style={{
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  background: "transparent",
                  padding: "4px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: TEXT.secondary,
                  fontSize: 14,
                  fontWeight: 400,
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
                {trashExpanded ? <ChevronDown /> : <ChevronRight />}
                <TrashIcon />
                <span style={{ fontWeight: 500 }}>Trash</span>
                {Object.keys(trashedNotes).length > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      background: BG.surface,
                      borderRadius: 8,
                      padding: "1px 6px",
                      color: TEXT.muted,
                    }}
                  >
                    {Object.keys(trashedNotes).length}
                  </span>
                )}
              </button>
              {trashExpanded && Object.keys(trashedNotes).length > 0 && (
                <>
                  {Object.values(trashedNotes).map((tn) => {
                    const daysAgo = Math.floor((Date.now() - tn.deletedAt) / (1000 * 60 * 60 * 24));
                    const ageLabel = daysAgo === 0 ? "today" : `${daysAgo}d`;
                    return (
                      <div
                        key={tn.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxMenu({ x: e.clientX, y: e.clientY, type: "trash", id: tn.id });
                        }}
                        style={{
                          padding: "4px 10px 4px 36px",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: "default",
                          opacity: 0.5,
                          fontSize: 13.5,
                          fontFamily: "inherit",
                          color: TEXT.secondary,
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          hBg(e.currentTarget, BG.elevated);
                          e.currentTarget.style.opacity = "0.75";
                        }}
                        onMouseLeave={(e) => {
                          hBg(e.currentTarget, "transparent");
                          e.currentTarget.style.opacity = "0.5";
                        }}
                      >
                        <FileIcon />
                        <span
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textDecoration: "line-through",
                            textDecorationColor: TEXT.muted,
                          }}
                        >
                          {tn.title || "Untitled"}
                        </span>
                        <span style={{ fontSize: 10, color: TEXT.muted, flexShrink: 0 }}>
                          {ageLabel}
                        </span>
                      </div>
                    );
                  })}
                  <button
                    onClick={emptyAllTrash}
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      background: "transparent",
                      padding: "6px 10px 6px 36px",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      color: SEMANTIC.error,
                      fontSize: 11.5,
                      fontFamily: "inherit",
                      fontWeight: 500,
                      opacity: 0.7,
                      transition: "background 0.12s, opacity 0.12s",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      hBg(e.currentTarget, BG.elevated);
                      e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      hBg(e.currentTarget, "transparent");
                      e.currentTarget.style.opacity = "0.7";
                    }}
                  >
                    Empty Trash
                  </button>
                </>
              )}
            </div>
          )}
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
