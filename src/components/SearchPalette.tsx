import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useExitGhost } from "../hooks/useExitGhost";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLayout } from "../context/LayoutContext";
import { useNoteData } from "../context/NoteDataContext";
import { useSidebar } from "../context/SidebarContext";
import { Z } from "../constants/zIndex";
import { tagRows, type TagEntry } from "../utils/tags";
import {
  foldText,
  orderResults,
  queryTerms,
  searchFiles,
  searchFolders,
  type FileHit,
  type FolderHit,
  type Range,
  type SearchResult,
} from "../utils/search";
import { RECENT_SHOWN, recentRows } from "../utils/recentNotes";
import { cssZoom } from "../utils/domHelpers";
import { atScale } from "../utils/uiScale";
import { tagPillStyle } from "../styles/tagPill";
import type { NoteData } from "../types/notes";
import { otherFileKind, splitExtension, type OtherFile } from "../utils/otherFiles";
import { CloseIcon, FolderIcon, OtherFileIcon, PlusIcon, SearchIcon } from "./Icons";
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
 *   - **Results**: one list in the order `orderResults` gives it. A title hit
 *     is one line with the matched words in the accent; a note matched only
 *     in its body carries one muted excerpt under its title. Every row has
 *     its folder muted on the right, from inside the folder chip if one is
 *     on. A folder whose own name matches is a row too (at most two); Enter
 *     makes it the grey folder chip, which narrows the search to it and its
 *     subfolders as the tag chip does. A file that is not a note (beside
 *     the notes, never the attachment store) is a row by its name, ranked
 *     among the notes; Enter opens it in its own app. When nothing matches, one row offers
 *     to create the note, in the chip's folder (not under a tag chip: the
 *     note would not carry the tag).
 *
 * Enter runs a pending query first (`flushSearch`), so Enter straight after
 * typing acts on the query as typed. Escape closes in one press; closing
 * clears the query and the chip, so the next open starts on recents. The
 * sidebar behind the scrim never changes (it does not read the query).
 */

interface SearchPaletteProps {
  /** Opens a note; `terms` are the words to tint in its matched block. */
  onOpenResult: (noteId: string, matchBlockId: string | null, terms?: string[]) => void;
  /** The vault's files that are not notes, and how one is opened in its own app. */
  otherFiles?: OtherFile[];
  onOpenFile?: (path: string) => void;
  /** Makes and opens a note with this name, in this folder. */
  onCreateNote?: (folder: string | null, title: string) => void;
  onClose: () => void;
  /** The recently opened note ids, newest first, as the store holds them. */
  recentIds?: string[];
  currentNoteId?: string | null;
}

type Row =
  | { kind: "recent"; noteId: string; title: string; folder: string | null }
  | { kind: "tag"; tag: string; count: number }
  | { kind: "result"; result: SearchResult }
  | { kind: "folder"; folder: FolderHit }
  | { kind: "file"; file: FileHit }
  | { kind: "create"; title: string };

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
  onCreateNote,
  otherFiles = [],
  onOpenFile,
  onClose,
  recentIds = [],
  currentNoteId = null,
}: SearchPaletteProps) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const { accentText } = useLayout() as { accentText: string };
  const { noteData } = useNoteData() as { noteData: NoteData };
  const {
    search,
    setSearch,
    searchResults,
    flushSearch,
    tagFilter,
    setTagFilter,
    folderFilter = null,
    setFolderFilter,
    folderList = [],
    tags,
  } = useSidebar() as {
    search: string;
    setSearch: (q: string) => void;
    searchResults: { results: SearchResult[]; totalCount: number; query?: string };
    flushSearch: () => { results: SearchResult[]; query?: string; flushed: boolean };
    tagFilter: string | null;
    setTagFilter: (tag: string | null, query?: string) => void;
    folderFilter?: string | null;
    setFolderFilter?: (folder: string | null, query?: string) => void;
    folderList?: string[];
    tags: Map<string, TagEntry>;
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useExitGhost(scrimRef);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(panelRef as RefObject<HTMLElement>, true, "first");

  const query = search.trim();
  const filtered = !!(tagFilter || folderFilter);
  // `#` lists tags until a tag chip is on; under one it is searched as text.
  const mode: "recent" | "tags" | "results" =
    query === ""
      ? filtered
        ? "results"
        : "recent"
      : query.startsWith("#") && !tagFilter
        ? "tags"
        : "results";

  /**
   * The result rows for `results`, which answer `applied`: notes and
   * matching folders in one order, or the Create row when nothing matches.
   * Enter reads this too, so it acts on the list drawn. "Nothing matches" is
   * said only of results that answer the text typed: until the debounced
   * query lands, the empty list is an earlier keystroke's and offered
   * `Create "Tes"` for a moment before `Test` arrived.
   */
  const resultRows = (results: SearchResult[], applied: string, typed: string): Row[] => {
    const folders = folderFilter ? [] : searchFolders(applied, folderList);
    // A file carries no tags, so a tag chip leaves none.
    const files = tagFilter || !onOpenFile ? [] : searchFiles(applied, otherFiles, folderFilter);
    const ordered: Row[] = orderResults(results, folders, files).map((r) =>
      r.kind === "note" ? { kind: "result", result: r.result } : r,
    );
    if (ordered.length === 0 && typed && applied === typed && !tagFilter && onCreateNote)
      return [{ kind: "create", title: typed }];
    return ordered;
  };

  // The list is compact: a fixed field, then at most `shown` single-line rows
  // (a body hit's excerpt makes its row taller and counts for more) before the
  // list scrolls inside; a shorter list is shorter. Recents never scroll.
  const [shown, setShown] = useState(rowsThatFit);
  useEffect(() => {
    const onResize = () => setShown(rowsThatFit());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resultRows reads the filters, folders, files and callbacks listed.
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
    return resultRows(searchResults.results, searchResults.query ?? query, query);
  }, [
    mode,
    recentIds,
    noteData,
    currentNoteId,
    shown,
    query,
    tags,
    searchResults,
    folderFilter,
    tagFilter,
    folderList,
    otherFiles,
    onOpenFile,
    onCreateNote,
  ]);

  // The highlight: a position in the rows drawn, reset to the first whenever
  // the list's *content* changes (a keystroke, a chip, results landing). Not
  // on the array's identity: the index re-runs the query on every change to
  // the note store, and a save or watcher event landing between ArrowDown
  // and Enter would put the highlight back on the first row.
  const [active, setActive] = useState(0);
  const rowKey = (r: Row) =>
    r.kind === "tag"
      ? `#${r.tag}`
      : r.kind === "recent"
        ? r.noteId
        : r.kind === "folder"
          ? `/${r.folder.path}`
          : r.kind === "file"
            ? `~${r.file.path}`
            : r.kind === "create"
              ? `+${r.title}`
              : r.result.noteId;
  const rowsKey = rows.map(rowKey).join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key changing is the reset.
  useLayoutEffect(() => setActive(0), [rowsKey]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-search-index="${active}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function")
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [active]);

  const openResult = (r: SearchResult) => {
    onOpenResult(r.noteId, r.matchBlockId, queryTerms(query));
    onClose();
  };
  const chooseTag = (tag: string) => {
    setTagFilter(tag, "");
    setSearch("");
    inputRef.current?.focus();
  };
  // The × keeps searching what is in the field; Backspace (the field empty)
  // puts the chip back there as text.
  const removeChip = (backToText: boolean) => {
    const tag = tagFilter;
    setTagFilter(null, backToText && tag ? `#${tag}` : query);
    if (backToText && tag) setSearch(`#${tag}`);
    inputRef.current?.focus();
  };
  const folderName = folderFilter ? folderFilter.slice(folderFilter.lastIndexOf("/") + 1) : "";
  const chooseFolder = (path: string) => {
    setFolderFilter?.(path, "");
    setSearch("");
    inputRef.current?.focus();
  };
  const removeFolderChip = (backToText: boolean) => {
    setFolderFilter?.(null, backToText ? folderName : query);
    if (backToText) setSearch(folderName);
    inputRef.current?.focus();
  };
  const act = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "recent") {
      onOpenResult(row.noteId, null);
      onClose();
    } else if (row.kind === "tag") chooseTag(row.tag);
    else if (row.kind === "folder") chooseFolder(row.folder.path);
    else if (row.kind === "file") {
      onOpenFile?.(row.file.path);
      onClose();
    } else if (row.kind === "create") {
      onCreateNote?.(folderFilter, row.title);
      onClose();
    } else openResult(row.result);
  };
  const onEnter = () => {
    if (mode !== "results") return act(rows[active]);
    // Enter straight after a keystroke acts on the query as typed.
    const { results, query: applied, flushed } = flushSearch();
    if (!flushed) return act(rows[active]);
    act(resultRows(results, applied ?? query, query)[0]);
  };

  // With a chip and an empty field, the results are everything in scope.
  const scopeCount = searchResults.totalCount;
  const placeholder = filtered
    ? `Search ${scopeCount} ${scopeCount === 1 ? "note" : "notes"}`
    : "Search notes";
  const filesShown = rows.filter((r) => r.kind === "file").length;
  const hitsShown = rows.filter((r) => r.kind === "result").length + filesShown;
  const hitsTotal = searchResults.totalCount + filesShown;
  const count =
    mode === "results" && query && hitsShown > 0
      ? hitsTotal <= hitsShown
        ? `${hitsTotal} result${hitsTotal === 1 ? "" : "s"}`
        : `${hitsShown} of ${hitsTotal}`
      : "";
  const scope = `${folderFilter ? ` in ${folderName}` : ""}${tagFilter ? ` tagged #${tagFilter}` : ""}`;
  const emptyText =
    rows.length > 0
      ? null
      : mode === "recent"
        ? "No recent notes yet"
        : mode === "tags"
          ? query === "#"
            ? "No tags yet"
            : `No tags match “${query}”`
          : mode === "results" && (query || filtered) && (searchResults.query ?? query) === query
            ? query
              ? `No notes${scope} match “${query}”`
              : `No notes${scope}`
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
  // Under a folder chip, a path is read from inside that folder.
  const folderPath = (folder: string | null) => {
    let shown = folder;
    if (folder && folderFilter && mode === "results")
      shown = folder === folderFilter ? null : folder.slice(folderFilter.length + 1);
    return shown ? <span style={folderStyle}>{shown.split("/").join(" / ")}</span> : null;
  };
  const glyph = { display: "inline-flex", color: TEXT.secondary, flexShrink: 0 } as const;

  const rowProps = (i: number) => ({
    type: "button" as const,
    "data-search-index": i,
    // The rows are the listbox's options; focus stays in the field, which
    // names the highlighted one (aria-activedescendant).
    id: `search-option-${i}`,
    role: "option",
    "aria-selected": i === active,
    tabIndex: -1,
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
      ref={scrimRef}
      className="motion-fade"
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
      }}
    >
      <div
        ref={panelRef}
        className="motion-pop motion-from-top"
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
          {folderFilter && (
            <span
              data-testid="search-folder-chip"
              style={{
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
                maxWidth: "40%",
                padding: "2px 2px 2px 6px",
                borderRadius: 6,
                background: BG.hover,
                color: TEXT.primary,
              }}
            >
              <span style={glyph}>
                <FolderIcon size={13} />
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {folderName}
              </span>
              <button
                type="button"
                aria-label={`Remove ${folderName} folder filter`}
                onClick={() => removeFolderChip(false)}
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
                  flexShrink: 0,
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
            aria-controls={rows.length > 0 ? "search-results" : undefined}
            aria-activedescendant={rows[active] ? `search-option-${active}` : undefined}
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
              } else if (e.key === "Backspace" && filtered && search === "") {
                // The last chip goes first: the tag, then the folder.
                e.preventDefault();
                if (tagFilter) removeChip(true);
                else removeFolderChip(true);
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
            <div
              id="search-results"
              role="listbox"
              aria-label={mode === "recent" ? "Recent notes" : "Results"}
            >
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
                if (row.kind === "folder")
                  return (
                    <button key={rowKey(row)} {...rowProps(i)} onClick={() => act(row)}>
                      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{ ...titleStyle, display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <span style={glyph}>
                            <FolderIcon size={14} />
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {renderHighlightedTitle(
                              row.folder.name,
                              row.folder.nameRanges,
                              accentText,
                            )}
                          </span>
                        </span>
                        {folderPath(row.folder.parent)}
                      </span>
                    </button>
                  );
                if (row.kind === "file") {
                  // The extension muted, as the sidebar draws it; a match in
                  // it (`pdf`) still lights.
                  const { stem, ext } = splitExtension(row.file.name);
                  const clip = (from: number, to: number) =>
                    row.file.nameRanges
                      .filter(([a, b]) => b > from && a < to)
                      .map(([a, b]) => [Math.max(a, from) - from, Math.min(b, to) - from] as Range);
                  return (
                    <button key={rowKey(row)} {...rowProps(i)} onClick={() => act(row)}>
                      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{ ...titleStyle, display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <span style={glyph}>
                            <OtherFileIcon kind={otherFileKind(row.file.name)} size={14} />
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {renderHighlightedTitle(stem, clip(0, stem.length), accentText)}
                            <span style={{ color: TEXT.muted }}>
                              {renderHighlightedTitle(
                                ext,
                                clip(stem.length, row.file.name.length),
                                accentText,
                              )}
                            </span>
                          </span>
                        </span>
                        {folderPath(row.file.folder)}
                      </span>
                    </button>
                  );
                }
                if (row.kind === "create")
                  return (
                    <button key={rowKey(row)} {...rowProps(i)} onClick={() => act(row)}>
                      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{ ...titleStyle, display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <span style={glyph}>
                            <PlusIcon size={14} />
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            Create “{row.title}”
                          </span>
                        </span>
                        {folderFilter && (
                          <span style={folderStyle}>{folderFilter.split("/").join(" / ")}</span>
                        )}
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
          </div>
        )}
      </div>
    </div>
  );
}
