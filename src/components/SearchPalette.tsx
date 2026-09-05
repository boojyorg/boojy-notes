import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLayout } from "../context/LayoutContext";
import { useNoteData } from "../context/NoteDataContext";
import { useSidebar } from "../context/SidebarContext";
import { extractAllTags } from "../utils/tags";
import { Z } from "../constants/zIndex";
import { SearchIcon } from "./Icons";
import { TagChips, renderHighlightedTitle, renderSnippet, type Snippet } from "./SearchParts";

/**
 * The desktop search, as a palette (Cmd+K / Cmd+P): a field over a dimmed
 * window, results beneath it. Search only, nothing else lives here. Title hits
 * come first with the match in the accent; a body hit shows one muted line of
 * context under the title. Every row carries its folder, muted, on the right.
 * Nothing shows before you type; a `#` shows tags.
 *
 * The query and results are the sidebar's own search state (SidebarContext),
 * so the mobile sidebar and this palette are one search with two faces;
 * closing clears it. Enter opens the highlighted result (and jumps to the
 * matched block, as the sidebar did), Escape or a click outside closes.
 */

interface SearchPaletteProps {
  onOpenResult: (noteId: string, matchBlockId: string | null) => void;
  onClose: () => void;
}

interface Result {
  noteId: string;
  title: string;
  folder: string | null;
  matchIn: "title" | "body";
  matchStart: number;
  matchEnd: number;
  snippet: Snippet | null;
  matchBlockId: string | null;
  _globalIndex: number;
}

const PALETTE_WIDTH = 560;

export default function SearchPalette({ onOpenResult, onClose }: SearchPaletteProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const { accentColor } = useLayout() as { accentColor: string };
  const { noteData } = useNoteData() as { noteData: Record<string, { title: string }> };
  const {
    search,
    setSearch,
    searchMode,
    searchResults,
    activeResultIndex,
    navigateResults,
    getActiveResult,
  } = useSidebar() as {
    search: string;
    setSearch: (q: string) => void;
    searchMode: boolean;
    searchResults: { results: Result[]; totalCount: number };
    activeResultIndex: number;
    navigateResults: (direction: "up" | "down") => void;
    getActiveResult: () => Result | null;
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef as RefObject<HTMLElement>, true, "first");

  // Keep the highlighted row on screen as the arrows move it.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-search-index="${activeResultIndex}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function")
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [activeResultIndex]);

  const tagSuggestions = useMemo(() => {
    if (!search.startsWith("#")) return null;
    const tagMap = extractAllTags(noteData) as Map<string, Set<string>>;
    const filter = search.slice(1).toLowerCase();
    return [...tagMap.entries()]
      .map(([tag, ids]) => ({ tag, count: ids.size }))
      .filter((t) => !filter || t.tag.toLowerCase().includes(filter))
      .sort((a, b) => b.count - a.count);
  }, [search, noteData]);

  const open = (r: Result) => {
    onOpenResult(r.noteId, r.matchBlockId);
    onClose();
  };

  const results = searchResults.results;
  const hasQuery = search.trim().length > 0;
  const showTags = hasQuery && results.length === 0 && tagSuggestions && tagSuggestions.length > 0;
  const showEmpty = hasQuery && searchMode && results.length === 0 && !showTags;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.OVERLAY,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        // Top third: results grow downward and the field stays put.
        paddingTop: "12vh",
        animation: "fadeIn 0.12s ease",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${PALETTE_WIDTH}px, 92vw)`,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 12,
          boxShadow: theme.modalShadow,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 48,
            padding: "0 16px",
            flexShrink: 0,
            color: TEXT.muted,
          }}
        >
          <SearchIcon size={16} />
          <input
            type="text"
            autoFocus
            aria-label="Search notes"
            placeholder="Search notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                navigateResults("down");
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                navigateResults("up");
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = getActiveResult();
                if (r) open(r);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: TEXT.primary,
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
          {hasQuery && (
            <span style={{ fontSize: 11, color: TEXT.muted, flexShrink: 0 }}>
              {results.length === 0
                ? ""
                : searchResults.totalCount <= results.length
                  ? `${searchResults.totalCount} result${searchResults.totalCount === 1 ? "" : "s"}`
                  : `${results.length} of ${searchResults.totalCount}`}
            </span>
          )}
        </div>

        {(results.length > 0 || showTags || showEmpty) && (
          <div
            ref={listRef}
            style={{
              borderTop: `1px solid ${BG.divider}`,
              overflowY: "auto",
              padding: 6,
            }}
          >
            {showTags && tagSuggestions && (
              <TagChips
                title={search === "#" ? "All tags" : "Tags"}
                tags={tagSuggestions}
                limit={30}
                onPick={(tag) => setSearch(`#${tag}`)}
                TEXT={TEXT}
                ACCENT={ACCENT}
              />
            )}
            {showEmpty && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: TEXT.muted }}>
                No results for &ldquo;{search}&rdquo;
              </div>
            )}
            {results.map((r) => {
              const active = r._globalIndex === activeResultIndex;
              const folderPath = r.folder ? r.folder.split("/").join(" / ") : null;
              return (
                <button
                  type="button"
                  key={r.noteId}
                  data-search-index={r._globalIndex}
                  onClick={() => open(r)}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = BG.surface;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: "7px 10px",
                    border: "none",
                    borderRadius: 8,
                    background: active ? BG.hover : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "background 0.12s",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 14,
                        color: TEXT.primary,
                      }}
                    >
                      {r.matchIn === "title"
                        ? renderHighlightedTitle(r.title, r.matchStart, r.matchEnd, accentColor)
                        : r.title}
                    </span>
                    {folderPath && (
                      <span
                        style={{
                          flexShrink: 0,
                          maxWidth: "45%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          color: TEXT.muted,
                        }}
                      >
                        {folderPath}
                      </span>
                    )}
                  </span>
                  {/* One line of context, only when the hit is in the body. */}
                  {r.matchIn === "body" && r.snippet && (
                    <span
                      style={{
                        fontSize: 12.5,
                        lineHeight: "16px",
                        color: TEXT.muted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {renderSnippet(r.snippet, accentColor)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
