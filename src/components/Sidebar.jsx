import { BG, TEXT, ACCENT, SEMANTIC } from "../constants/colors";
import {
  ChevronRight, ChevronDown, FolderIcon, FileIcon,
  SearchIcon, TrashIcon,
} from "./Icons";

const hBg = (el, c) => { el.style.background = c; };

export default function Sidebar({
  search, setSearch, searchFocused, setSearchFocused, searchInputRef,
  sidebarWidth, accentColor, selectionStyle,
  filteredTree, fNotes, noteData, activeNote,
  expanded, toggle, openNote, setCtxMenu,
  renamingFolder, setRenamingFolder, renameFolder,
  createFolder, createNote,
  handleSidebarPointerDown, sidebarScrollRef,
  trashedNotes, trashExpanded, setTrashExpanded,
  emptyAllTrash, restoreNote, permanentDeleteNote,
}) {
  // Render a note row at given depth
  const renderNote = (nId, depth) => {
    const n = noteData[nId]; if (!n) return null;
    const act = activeNote === nId;
    return (
      <button key={nId} data-note-id={nId} onClick={() => openNote(nId)} className="sidebar-note"
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "note", id: nId }); }}
        style={{
          width: selectionStyle === "B" ? "calc(100% - 8px)" : "calc(100% + 2px)",
          marginTop: 0, marginBottom: 0,
          marginLeft: selectionStyle === "B" ? 5 : -1,
          marginRight: selectionStyle === "B" ? 3 : 0,
          border: "none", outline: "none", appearance: "none", WebkitAppearance: "none",
          cursor: "pointer",
          background: act ? `${accentColor}${selectionStyle === "B" ? "30" : "15"}` : "transparent",
          borderRadius: selectionStyle === "B" ? 6 : 0,
          ...(selectionStyle === "A" ? { borderLeft: act ? `3px solid ${accentColor}` : "3px solid transparent" } : {}),
          padding: selectionStyle === "B" ? `4px 10px 4px ${7 + depth * 20 + 19}px` : `4px 10px 4px ${7 + depth * 20 + 19}px`,
          display: "flex", alignItems: "center", gap: 5,
          color: act ? TEXT.primary : TEXT.secondary,
          fontSize: 14, fontFamily: "inherit",
          fontWeight: act ? 600 : 400,
          transition: "background 0.12s", textAlign: "left",
          boxShadow: selectionStyle === "A" && act ? `inset 4px 0 12px -4px ${ACCENT.primary}30` : "none",
        }}
        onMouseEnter={(e) => { if (!act) hBg(e.currentTarget, BG.elevated); }}
        onMouseLeave={(e) => { if (!act) hBg(e.currentTarget, "transparent"); }}
      >
        <FileIcon active={act} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{n.title}</span>
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
        <button data-folder-path={folderPath} onClick={() => toggle(folderPath)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folderPath }); }}
          style={{
            width: "100%", background: "none", border: "none",
            cursor: "pointer", padding: `4px 10px 4px ${10 + depth * 20}px`,
            display: "flex", alignItems: "center", gap: 5,
            color: TEXT.secondary, fontSize: 14, fontWeight: 400, fontFamily: "inherit",
            transition: "background 0.12s, color 0.12s", textAlign: "left",
          }}
          onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; }}
          onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
        >
          {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span style={{ width: 14, flexShrink: 0 }} />}
          <FolderIcon open={isOpen} color={accentColor} />
          {renamingFolder === folderPath ? (
            <input
              autoFocus
              defaultValue={folder.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { renameFolder(folderPath, e.target.value.trim()); setRenamingFolder(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { renameFolder(folderPath, e.target.value.trim()); setRenamingFolder(null); }
                if (e.key === "Escape") setRenamingFolder(null);
              }}
              style={{
                background: BG.darkest, border: `1px solid ${accentColor}`, borderRadius: 4,
                color: TEXT.primary, fontSize: 12.5, fontFamily: "inherit", fontWeight: 500,
                padding: "1px 4px", outline: "none", width: "100%",
              }}
            />
          ) : (
            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
          )}
        </button>
        {isOpen && (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 10 + depth * 20 + 7,
              top: 0, bottom: 0, width: 1,
              background: "rgba(58, 61, 74, 0.4)",
            }} />
            {folder.children.map(child => renderFolder(child, depth + 1))}
            {folder.notes.map(nId => renderNote(nId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Search */}
      <div style={{ padding: "8px 10px" }}>
        <div
          onClick={() => { if (!searchFocused && !search) { setSearchFocused(true); setTimeout(() => searchInputRef.current?.focus(), 0); } }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#18191E", borderRadius: 14, height: 28,
            width: (searchFocused || search) ? sidebarWidth - 20 : 95,
            padding: "0 10px",
            border: `1px solid ${searchFocused ? `${accentColor}60` : BG.divider}`,
            transition: "width 0.2s ease, border-color 0.2s ease",
            cursor: (searchFocused || search) ? "text" : "pointer",
            overflow: "hidden",
          }}>
          <SearchIcon />
          {(searchFocused || search) ? (
            <input ref={searchInputRef} type="text" autoFocus
              value={search} onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                background: "none", border: "none", outline: "none",
                color: TEXT.primary, fontSize: 13, width: "100%", fontFamily: "inherit",
              }}
            />
          ) : (
            <span style={{ color: TEXT.muted, fontSize: 13, fontWeight: 500, userSelect: "none" }}>Search</span>
          )}
        </div>
      </div>

      {/* File tree */}
      <div ref={sidebarScrollRef} onPointerDown={handleSidebarPointerDown} style={{
        flex: 1, overflow: "auto", padding: "2px 0",
      }}>
        <div style={{ height: 5 }} />
        {filteredTree.map(f => renderFolder(f, 0))}
        {!search && (
          <button onClick={createFolder} style={{
            width: "100%", border: "none", cursor: "pointer",
            background: "transparent",
            padding: `4px 10px 4px 10px`,
            display: "flex", alignItems: "center", gap: 5,
            color: TEXT.secondary, fontSize: 14, fontFamily: "inherit", fontWeight: 500,
            opacity: 0.55,
            transition: "background 0.12s, color 0.12s, opacity 0.12s", textAlign: "left",
          }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; e.currentTarget.style.opacity = "0.55"; }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ width: 17, flexShrink: 0, textAlign: "center" }}>+</span>
            <span>New Folder</span>
          </button>
        )}
        {(filteredTree.length > 0 || fNotes.length > 0) && <div style={{ height: 16 }} />}
        {fNotes.map(nId => renderNote(nId, 0))}
        {!search && (
          <button onClick={() => createNote(null)} style={{
            width: "100%", border: "none", cursor: "pointer",
            background: "transparent",
            borderLeft: "3px solid transparent",
            padding: `4px 10px 4px ${7 + 19}px`,
            display: "flex", alignItems: "center", gap: 5,
            color: TEXT.secondary, fontSize: 14, fontFamily: "inherit", fontWeight: 500,
            opacity: 0.55,
            transition: "background 0.12s, color 0.12s, opacity 0.12s", textAlign: "left",
          }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; e.currentTarget.style.opacity = "0.55"; }}
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
            onClick={() => setTrashExpanded(prev => !prev)}
            style={{
              width: "100%", border: "none", cursor: "pointer",
              background: "transparent",
              padding: "4px 10px",
              display: "flex", alignItems: "center", gap: 5,
              color: TEXT.secondary, fontSize: 14, fontWeight: 400, fontFamily: "inherit",
              transition: "background 0.12s, color 0.12s", textAlign: "left",
            }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
          >
            {trashExpanded ? <ChevronDown /> : <ChevronRight />}
            <TrashIcon />
            <span style={{ fontWeight: 500 }}>Trash</span>
            {Object.keys(trashedNotes).length > 0 && (
              <span style={{
                marginLeft: "auto", fontSize: 10,
                background: BG.surface, borderRadius: 8,
                padding: "1px 6px", color: TEXT.muted,
              }}>
                {Object.keys(trashedNotes).length}
              </span>
            )}
          </button>
          {trashExpanded && Object.keys(trashedNotes).length > 0 && (
            <>
              {Object.values(trashedNotes).map(tn => {
                const daysAgo = Math.floor((Date.now() - tn.deletedAt) / (1000 * 60 * 60 * 24));
                const ageLabel = daysAgo === 0 ? "today" : `${daysAgo}d`;
                return (
                  <div
                    key={tn.id}
                    onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "trash", id: tn.id }); }}
                    style={{
                      padding: "4px 10px 4px 36px",
                      display: "flex", alignItems: "center", gap: 5,
                      cursor: "default", opacity: 0.5,
                      fontSize: 13.5, fontFamily: "inherit",
                      color: TEXT.secondary,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.opacity = "0.75"; }}
                    onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.opacity = "0.5"; }}
                  >
                    <FileIcon />
                    <span style={{
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textDecoration: "line-through", textDecorationColor: TEXT.muted,
                    }}>{tn.title || "Untitled"}</span>
                    <span style={{ fontSize: 10, color: TEXT.muted, flexShrink: 0 }}>{ageLabel}</span>
                  </div>
                );
              })}
              <button
                onClick={emptyAllTrash}
                style={{
                  width: "100%", border: "none", cursor: "pointer",
                  background: "transparent",
                  padding: "6px 10px 6px 36px",
                  display: "flex", alignItems: "center", gap: 5,
                  color: SEMANTIC.error, fontSize: 11.5, fontFamily: "inherit", fontWeight: 500,
                  opacity: 0.7,
                  transition: "background 0.12s, opacity 0.12s", textAlign: "left",
                }}
                onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.opacity = "0.7"; }}
              >
                Empty Trash
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
