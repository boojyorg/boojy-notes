/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#111", secondary: "#555", muted: "#888" },
      BG: { elevated: "#fff", surface: "#f2f2f2", hover: "#e8e8e8", divider: "#ddd" },
      ACCENT: { primary: "#2A737D", onAccent: "#fff", text: "#2A737D" },
      modalShadow: "0 8px 24px rgba(0,0,0,0.2)",
    },
  }),
}));
vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => ({ accentColor: "#2A737D", accentText: "#2A737D" }),
}));
vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteData: () => ({ noteData: state.noteData }),
}));
vi.mock("../../src/context/SidebarContext", () => ({
  useSidebar: () => state.sidebar,
}));

import SearchPalette from "../../src/components/SearchPalette";
import { buildSearchIndex, searchNotes, type SearchResult } from "../../src/utils/search";
import { extractAllTags } from "../../src/utils/tags";
import type { NoteData } from "../../src/types/notes";

const bodyHit: SearchResult = {
  noteId: "n2",
  title: "Week 3 lecture",
  folder: "Uni/COMP336",
  score: 1,
  matchIn: "body",
  titleRanges: [],
  snippet: { text: "…compare with the boojy sidebar…", ranges: [[18, 23]] },
  matchBlockId: "b7",
  lastModified: 0,
};
const titleHit: SearchResult = {
  noteId: "n1",
  title: "Boojy Notes Ideas",
  folder: null,
  score: 4,
  matchIn: "title",
  titleRanges: [[0, 5]],
  snippet: null,
  matchBlockId: null,
  lastModified: 0,
};

const noteData: NoteData = {
  n1: {
    title: "Boojy Notes Ideas",
    folder: null,
    content: { title: "", blocks: [{ id: "b1", type: "p", text: "#work #home" }] },
  },
  n2: {
    title: "Week 3 lecture",
    folder: "Uni/COMP336",
    content: { title: "", blocks: [{ id: "b7", type: "p", text: "#work" }] },
  },
  n3: { title: "Plan", folder: null, content: { title: "", blocks: [] } },
  n4: { title: "Shopping", folder: "Home", content: { title: "", blocks: [] } },
} as never;

const state: { noteData: NoteData; sidebar: Record<string, unknown> } = {
  noteData,
  sidebar: {},
};

function setup(over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  state.noteData = noteData;
  state.sidebar = {
    search: "",
    setSearch: vi.fn(),
    searchResults: { results: [], totalCount: 0 },
    flushSearch: vi.fn(() => ({ results: [], flushed: false })),
    tagFilter: null,
    setTagFilter: vi.fn(),
    tags: extractAllTags(noteData),
    ...over,
  };
  const onOpenResult = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SearchPalette
      onOpenResult={onOpenResult}
      onClose={onClose}
      recentIds={["n1", "n3", "n4"]}
      currentNoteId="n1"
      {...props}
    />,
  );
  return { ...utils, onOpenResult, onClose };
}
const rows = (c: HTMLElement) => [...c.querySelectorAll("[data-search-index]")];
const current = (c: HTMLElement) => c.querySelector('[data-search-index][aria-selected="true"]');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SearchPalette", () => {
  it("opens on the recent notes, labelled, the open note left out, the first highlighted", () => {
    const { container, getByRole, getByLabelText, getByText } = setup();
    expect(getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(getByLabelText("Search notes")).toHaveFocus();
    expect(getByText("Recent")).toBeInTheDocument();
    expect(rows(container).map((r) => r.textContent)).toEqual(["Plan", "ShoppingHome"]);
    expect(current(container)?.textContent).toBe("Plan");
  });

  it("Enter on a recent opens it at the top; the arrows move the highlight", () => {
    const { container, getByLabelText, onOpenResult, onClose } = setup();
    const field = getByLabelText("Search notes");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(current(container)?.textContent).toContain("Shopping");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(current(container)?.textContent).toContain("Shopping");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onOpenResult).toHaveBeenCalledWith("n4", null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says so when there are no recents yet (the open note alone is none)", () => {
    const { container, queryByText, getByText } = setup({}, { recentIds: ["n1"] });
    expect(rows(container)).toHaveLength(0);
    expect(queryByText("Recent")).not.toBeInTheDocument();
    expect(getByText("No recent notes yet")).toBeInTheDocument();
  });

  it("types into the shared search state", () => {
    const setSearch = vi.fn();
    const { getByLabelText } = setup({ setSearch });
    fireEvent.change(getByLabelText("Search notes"), { target: { value: "boo" } });
    expect(setSearch).toHaveBeenCalledWith("boo");
  });

  it("draws a title hit on one line and a body hit with one excerpt, folders on the right", () => {
    const { container, getByText, queryByText } = setup({
      search: "boojy",
      searchResults: { results: [titleHit, bodyHit], totalCount: 2 },
    });
    const list = rows(container);
    expect(list).toHaveLength(2);
    expect(list[0].textContent).toBe("Boojy Notes Ideas");
    expect(list[1].textContent).toContain("compare with the boojy sidebar");
    expect(getByText("Uni / COMP336")).toBeInTheDocument();
    expect(getByText("2 results")).toBeInTheDocument();
    expect(queryByText("Recent")).not.toBeInTheDocument();
  });

  it("Enter runs a pending query first and opens the first of the fresh results", () => {
    const flushSearch = vi.fn(() => ({ results: [bodyHit, titleHit], flushed: true }));
    const { getByLabelText, onOpenResult } = setup({
      search: "boojy",
      searchResults: { results: [titleHit], totalCount: 1 },
      flushSearch,
    });
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "Enter" });
    expect(flushSearch).toHaveBeenCalledTimes(1);
    expect(onOpenResult).toHaveBeenCalledWith("n2", "b7");
  });

  it("Enter with nothing pending opens the highlighted row, with its matched block", () => {
    const flushSearch = vi.fn(() => ({ results: [titleHit, bodyHit], flushed: false }));
    const { getByLabelText, onOpenResult, onClose } = setup({
      search: "boojy",
      searchResults: { results: [titleHit, bodyHit], totalCount: 2 },
      flushSearch,
    });
    const field = getByLabelText("Search notes");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onOpenResult).toHaveBeenCalledWith("n2", "b7");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("highlights the row Enter opens, whatever folder each hit is in (review §4.3)", () => {
    const data = {
      root: {
        id: "root",
        title: "Notes",
        folder: null,
        content: { blocks: [{ id: "b1", type: "p", text: "The plan is simple." }] },
      },
      work: {
        id: "work",
        title: "Plan",
        folder: "Work",
        content: { blocks: [{ id: "b2", type: "p", text: "Plan body." }] },
      },
    } as never;
    const raw = searchNotes("plan", buildSearchIndex(data));
    expect(raw.results.map((r) => r.title)).toEqual(["Plan", "Notes"]);
    const searchResults = { results: raw.results, totalCount: raw.totalCount };
    for (const idx of [0, 1]) {
      const t = setup({
        search: "plan",
        searchResults,
        flushSearch: () => ({ results: raw.results, flushed: false }),
      });
      const field = t.getByLabelText("Search notes");
      for (let i = 0; i < idx; i++) fireEvent.keyDown(field, { key: "ArrowDown" });
      expect(current(t.container)).toBe(rows(t.container)[idx]);
      fireEvent.keyDown(field, { key: "Enter" });
      expect(t.onOpenResult).toHaveBeenCalledWith(
        raw.results[idx].noteId,
        raw.results[idx].matchBlockId,
      );
      cleanup();
    }
  });

  it("keeps the highlight when the same results land again as a new array", () => {
    const first = { results: [titleHit, bodyHit], totalCount: 2 };
    const t = setup({ search: "boojy", searchResults: first });
    fireEvent.keyDown(t.getByLabelText("Search notes"), { key: "ArrowDown" });
    expect(current(t.container)?.textContent).toContain("Week 3 lecture");
    state.sidebar = {
      ...state.sidebar,
      searchResults: { results: [{ ...titleHit }, { ...bodyHit }], totalCount: 2 },
    };
    t.rerender(
      <SearchPalette
        onOpenResult={t.onOpenResult}
        onClose={t.onClose}
        recentIds={[]}
        currentNoteId="n1"
      />,
    );
    expect(current(t.container)?.textContent).toContain("Week 3 lecture");
    state.sidebar = { ...state.sidebar, searchResults: { results: [bodyHit], totalCount: 1 } };
    t.rerender(
      <SearchPalette
        onOpenResult={t.onOpenResult}
        onClose={t.onClose}
        recentIds={[]}
        currentNoteId="n1"
      />,
    );
    expect(current(t.container)).toBe(rows(t.container)[0]);
  });

  it("opens a clicked row", () => {
    const { getByText, onOpenResult } = setup({
      search: "boojy",
      searchResults: { results: [titleHit, bodyHit], totalCount: 2 },
    });
    fireEvent.click(getByText("Week 3 lecture"));
    expect(onOpenResult).toHaveBeenCalledWith("n2", "b7");
  });

  it("closes on Escape in one press and on a click outside the panel", () => {
    const { getByLabelText, getByRole, onClose } = setup({ tagFilter: "work", search: "x" });
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says when nothing matches", () => {
    const { getByText } = setup({ search: "zzz" });
    expect(getByText(/No notes match “zzz”/)).toBeInTheDocument();
  });

  it("a # lists tags as rows, most used first, filtered by what follows", () => {
    const { container, getByText, queryByText } = setup({ search: "#" });
    expect(rows(container).map((r) => r.textContent)).toEqual(["#work2", "#home1"]);
    expect(queryByText(/No notes match/)).not.toBeInTheDocument();
    cleanup();
    const t = setup({ search: "#ho" });
    expect(rows(t.container).map((r) => r.textContent)).toEqual(["#home1"]);
    cleanup();
    const none = setup({ search: "#zz" });
    expect(none.getByText(/No tags match “#zz”/)).toBeInTheDocument();
    expect(getByText).toBeDefined();
  });

  it("Enter, Tab or a click on a tag row makes it the filter and empties the field", () => {
    for (const key of ["Enter", "Tab"]) {
      const setTagFilter = vi.fn();
      const setSearch = vi.fn();
      const t = setup({ search: "#ho", setTagFilter, setSearch });
      fireEvent.keyDown(t.getByLabelText("Search notes"), { key });
      expect(setTagFilter).toHaveBeenCalledWith("home", "");
      expect(setSearch).toHaveBeenCalledWith("");
      cleanup();
    }
    const setTagFilter = vi.fn();
    const t = setup({ search: "#", setTagFilter });
    fireEvent.click(t.getByText("#home"));
    expect(setTagFilter).toHaveBeenCalledWith("home", "");
  });

  it("with a filter, the chip is in the field, the placeholder counts the notes and results are listed", () => {
    const { getByTestId, getByLabelText, container } = setup({
      tagFilter: "work",
      searchResults: { results: [titleHit, bodyHit], totalCount: 2 },
    });
    expect(getByTestId("search-tag-chip").textContent).toContain("#work");
    expect(getByLabelText("Search notes")).toHaveAttribute("placeholder", "Search 2 notes");
    expect(rows(container)).toHaveLength(2);
  });

  it("the × removes the filter; Backspace on an empty field puts the tag back as text", () => {
    const setTagFilter = vi.fn();
    const setSearch = vi.fn();
    const t = setup({ tagFilter: "work", setTagFilter, setSearch });
    fireEvent.click(t.getByLabelText("Remove #work filter"));
    expect(setTagFilter).toHaveBeenCalledWith(null, "");
    fireEvent.keyDown(t.getByLabelText("Search notes"), { key: "Backspace" });
    expect(setTagFilter).toHaveBeenCalledWith(null, "#work");
    expect(setSearch).toHaveBeenCalledWith("#work");
  });

  it("says when nothing under a filter matches", () => {
    const a = setup({ tagFilter: "work", search: "zzz" });
    expect(a.getByText(/No notes tagged #work match “zzz”/)).toBeInTheDocument();
    cleanup();
    const b = setup({ tagFilter: "nobody" });
    expect(b.getByText(/No notes tagged #nobody/)).toBeInTheDocument();
  });
});
