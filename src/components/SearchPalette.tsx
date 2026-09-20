import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLayout } from "../context/LayoutContext";
import { useNoteData } from "../context/NoteDataContext";
import { useSidebar } from "../context/SidebarContext";
import { Z } from "../constants/zIndex";
import { tagRows, tagKey, type TagEntry } from "../utils/tags";
import { foldText, type SearchResult } from "../utils/search";
import { RECENT_SHOWN, recentRows } from "../utils/recentNotes";
import { cssZoom } from "../utils/domHelpers";
import { atScale } from "../utils/uiScale";
import { tagPillStyle } from "../styles/tagPill";
import type { NoteData } from "../types/notes";
import { CloseIcon, SearchIcon } from "./Icons";
import { renderHighlightedTitle, renderSnippet } from "./SearchParts";

/**
 * The desktop search, as a palette (Cmd+P): a field over a dimmed window,
 * one list beneath it. Three things the list can hold, one row grammar, one
 * highlight the arrows move and Enter acts on:
 *
 *   - **Recent** (empty field, no filter): the notes opened most recently,
 *     the open note left out, so Cmd+P then Enter is the way back to the
 *     note you were in. The one labelled state.
 *   - **Tags** (the field starts with `#`, no filter yet): every tag, most
 *     used first, filtered by what follows; Enter, Tab or a click makes it
 *     the filter chip in the field and lists the notes carrying that exact
 *     tag, the field emptied for further typing.
 *   - **Results**: one list as `searchNotes` returns it. A title hit is one
 *     line with the matched words in the accent; a note matched only in its
 *     body carries one muted excerpt under its title. Every row has its
 *     folder muted on the right.
 *
 * Enter runs a pending query first (`flushSearch`), so Enter straight after
 * typing acts on the query as typed. Escape closes in one press; closing
 * clears the query and the chip, so the next open starts on recents. The
 * sidebar behind the scrim never changes (it does not read the query).
 */

interface SearchPaletteProps {
  onOpenResult: (noteId: string, matchBlockId: string | null) => void;
  onClose: () => void;
  /** The recently opened note ids, newest first, as the store holds them. */
  recentIds?: string[];
  currentNoteId?: string | null;
}

type Row =
  | { kind: "recent"; noteId: string; title: string; folder: string | null }
  | { kind: "tag"; tag: string; count: number }
  | { kind: "result"; result: SearchResult };

const PALETTE_WIDTH = 560;
const FIELD_H = 48;
/** One row: 7px of padding round a 16px line. */
const ROW_H = 30;
const LIST_PAD = 6;
const LABEL_H = 28;
/** The palette's height, as a fraction of the window; `vh` divided by the UI scale. */
const MAX_VH = 70;
const TOP_VH = 12;

/** The list's height in single-line rows: eight at most, fewer in a short window. */
const LIST_ROWS = 8;

/** How many single-line rows the list may show before it scrolls, at most LIST_ROWS. */
function rowsThatFit(): number {
  if (typeof window === "undefined") return LIST_ROWS;
  const zoom = cssZoom(document.documentElement) || 1;
  const box = (window.innerHeight * MAX_VH) / 100 / zoom;
  const fit = Math.floor((box - FIELD_H - LABEL_H - LIST_PAD * 2) / ROW_H);
  return Math.max(1, Math.min(LIST_ROWS, fit));
}

export default function SearchPalette({
  onOpenResult,
  onClose,
  recentIds = [],
  currentNoteId = null,
}: SearchPaletteProps) {
  const { theme } = useTheme() as {
    theme: {
      BG: Record<string, string>;
      TEXT: Record<string, string>;
      ACCENT: Record<string, string>;
      modalShadow: string;
    };
  };
  const { BG, TEXT } = theme;
  const { accentText } = useLayout() as { accentText: string };
  const { noteData } = useNoteData() as { noteData: NoteData };
  const { search, setSearch, searchResults, flushSearch, tagFilter, setTagFilter, tags } =
    useSidebar() as {
      search: string;
      setSearch: (q: string) => void;
      searchResults: { results: SearchResult[]; totalCount: number };
      flushSearch: () => { results: SearchResult[]; flushed: boolean };
      tagFilter: string | null;
      setTagFilter: (tag: string | null, query?: string) => void;
      tags: Map<string, TagEntry>;
    };

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(panelRef as RefObject<HTMLElement>, true, "first");

  const query = search.trim();
  const mode: "recent" | "tags" | "results" = tagFilter
    ? "results"
    : query === ""
      ? "recent"
      : query.startsWith("#")
        ? "tags"
        : "results";

  // The list is compact: a fixed field, then at most `shown` single-line rows
  // (a body hit's excerpt makes its row taller and counts for more) before the
  // list scrolls inside; a shorter list is shorter. Recents never scroll.
  const [shown, setShown] = useState(rowsThatFit);
  useEffect(() => {
    const onResize = () => setShown(rowsThatFit());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (mode === "recent") {
      return recentRows(recentIds, noteData, currentNoteId, Math.min(shown, RECENT_SHOWN)).map(
        (noteId) => ({
          kind: "recent",
          noteId,
          title: noteData[noteId].title,
          folder: noteData[noteId].folder || null,
        }),
      );
    }
    if (mode === "tags") {
      const filter = foldText(query.slice(1)).text;
      return tagRows(tags)
        .filter((t) => !filter || foldText(t.tag).text.includes(filter))
        .map((t) => ({ kind: "tag", tag: t.tag, count: t.count }));
    }
    return searchResults.results.map((result) => ({ kind: "result", result }));
  }, [mode, recentIds, noteData, currentNoteId, shown, query, tags, searchResults.results]);

  // The highlight: a position in the rows drawn, reset to the first whenever
  // the list's *content* changes (a keystroke, a chip, results landing). Not
  // on the array's identity: the index re-runs the query on every change to
  // the note store, and a save or watcher event landing between ArrowDown
  // and Enter put the highlight back on the first row (CI, 2026-09-20).
  const [active, setActive] = useState(0);
  const rowsKey = rows
    .map((r) => (r.kind === "tag" ? `#${r.tag}` : r.kind === "recent" ? r.noteId : r.result.noteId))
    .join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key changing is the reset.
  useLayoutEffect(() => setActive(0), [rowsKey]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-search-index="${active}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function")
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [active]);

  const taggedCount = tagFilter ? (tags.get(tagKey(tagFilter))?.noteIds.size ?? 0) : 0;

  const openResult = (r: SearchResult) => {
    onOpenResult(r.noteId, r.matchBlockId);
    onClose();
  };
  const chooseTag = (tag: string) => {
    setTagFilter(tag, "");
    setSearch("");
    inputRef.current?.focus();
  };
  const removeChip = (backToText: boolean) => {
    const tag = tagFilter;
    setTagFilter(null, backToText && tag ? `#${tag}` : "");
    if (backToText && tag) setSearch(`#${tag}`);
    inputRef.current?.focus();
  };
  const act = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "recent") {
      onOpenResult(row.noteId, null);
      onClose();
    } else if (row.kind === "tag") chooseTag(row.tag);
    else openResult(row.result);
  };
  const onEnter = () => {
    if (mode !== "results") return act(rows[active]);
    // Enter straight after a keystroke acts on the query as typed.
    const { results, flushed } = flushSearch();
    const r = results[flushed ? 0 : active];
    if (r) openResult(r);
  };

  const placeholder = tagFilter
    ? `Search ${taggedCount} ${taggedCount === 1 ? "note" : "notes"}`
    : "Search notes";
  const count =
    mode === "results" && query
      ? searchResults.totalCount <= rows.length
        ? `${searchResults.totalCount} result${searchResults.totalCount === 1 ? "" : "s"}`
        : `${rows.length} of ${searchResults.totalCount}`
      : "";
  const emptyText =
    rows.length > 0
      ? null
      : mode === "recent"
        ? "No recent notes yet"
        : mode === "tags"
          ? query === "#"
            ? "No tags yet"
            : `No tags match “${query}”`
          : mode === "results" && (query || tagFilter)
            ? tagFilter && query
              ? `No notes tagged #${tagFilter} match “${query}”`
              : tagFilter
                ? `No notes tagged #${tagFilter}`
                : `No notes match “${query}”`
            : null;

  const rowStyle = (isActive: boolean) =>
    ({
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minHeight: ROW_H,
      padding: "7px 10px",
      border: "none",
      borderRadius: 8,
      background: isActive ? BG.hover : "transparent",
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      fontSize: 14,
      color: TEXT.primary,
      lineHeight: "16px",
    }) as const;
  const titleStyle = {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as const;
  const folderStyle = {
    flexShrink: 0,
    maxWidth: "45%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
    color: TEXT.muted,
  } as const;
  const folderPath = (folder: string | null) =>
    folder ? <span style={folderStyle}>{folder.split("/").join(" / ")}</span> : null;

  const rowProps = (i: number) => ({
    type: "button" as const,
    "data-search-index": i,
    "aria-current": i === active || undefined,
    onMouseMove: () => setActive(i),
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (i !== active) e.currentTarget.style.background = BG.surface;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (i !== active) e.currentTarget.style.background = "transparent";
    },
    style: rowStyle(i === active),
  });

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
        paddingTop: atScale(`${TOP_VH}vh`),
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
          width: `min(${PALETTE_WIDTH}px, ${atScale("92vw")})`,
          maxHeight: atScale(`${MAX_VH}vh`),
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
            height: FIELD_H,
            padding: "0 16px",
            flexShrink: 0,
            color: TEXT.muted,
          }}
        >
          <SearchIcon size={16} />
          {tagFilter && (
            <span
              data-testid="search-tag-chip"
              style={{
                ...tagPillStyle(theme),
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                flexShrink: 0,
                paddingRight: 2,
              }}
            >
              #{tagFilter}
              <button
                type="button"
                aria-label={`Remove #${tagFilter} filter`}
                onClick={() => removeChip(false)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  border: "none",
                  borderRadius: 4,
                  background: "none",
                  color: TEXT.muted,
                  cursor: "pointer",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = TEXT.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = TEXT.muted;
                }}
              >
                <CloseIcon size={12} />
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            autoFocus
            aria-label="Search notes"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(0, rows.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              } else if (e.key === "Tab" && mode === "tags" && rows[active]) {
                e.preventDefault();
                act(rows[active]);
              } else if (e.key === "Backspace" && tagFilter && search === "") {
                e.preventDefault();
                removeChip(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: "none",
              border: "none",
              outline: "none",
              color: TEXT.primary,
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
          {count && <span style={{ fontSize: 11, color: TEXT.muted, flexShrink: 0 }}>{count}</span>}
        </div>

        {(rows.length > 0 || emptyText) && (
          <div
            ref={listRef}
            style={{
              borderTop: `1px solid ${BG.divider}`,
              overflowY: mode === "recent" ? "hidden" : "auto",
              maxHeight: shown * ROW_H + LIST_PAD * 2,
              boxSizing: "border-box",
              padding: LIST_PAD,
            }}
          >
            {mode === "recent" && rows.length > 0 && (
              <div
                style={{
                  height: LABEL_H,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: TEXT.muted,
                }}
              >
                Recent
              </div>
            )}
            {emptyText && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: TEXT.muted }}>
                {emptyText}
              </div>
            )}
            {rows.map((row, i) => {
              if (row.kind === "recent")
                return (
                  <button key={row.noteId} {...rowProps(i)} onClick={() => act(row)}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <span style={titleStyle}>{row.title || "Untitled"}</span>
                      {folderPath(row.folder)}
                    </span>
                  </button>
                );
              if (row.kind === "tag")
                return (
                  <button key={row.tag} {...rowProps(i)} onClick={() => act(row)}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <span style={{ ...titleStyle, color: accentText }}>#{row.tag}</span>
                      <span style={{ flexShrink: 0, fontSize: 12, color: TEXT.muted }}>
                        {row.count}
                      </span>
                    </span>
                  </button>
                );
              const r = row.result;
              return (
                <button key={r.noteId} {...rowProps(i)} onClick={() => act(row)}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={titleStyle}>
                      {renderHighlightedTitle(r.title || "Untitled", r.titleRanges, accentText)}
                    </span>
                    {folderPath(r.folder)}
                  </span>
                  {/* One line of context, only when the title does not explain the hit. */}
                  {r.matchIn === "body" && r.snippet && (
                    <span
                      style={{
                        fontSize: 12.5,
                        lineHeight: "16px",
                        color: TEXT.muted,
                        paddingLeft: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {renderSnippet(r.snippet, accentText)}
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
