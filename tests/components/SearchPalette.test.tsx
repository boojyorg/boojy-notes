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
      ACCENT: { primary: "#2A737D", onAccent: "#fff" },
      modalShadow: "0 8px 24px rgba(0,0,0,0.2)",
    },
  }),
}));
vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => ({ accentColor: "#2A737D" }),
}));
vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteData: () => ({ noteData: state.noteData }),
}));
vi.mock("../../src/context/SidebarContext", () => ({
  useSidebar: () => state.sidebar,
}));

import SearchPalette from "../../src/components/SearchPalette";

const bodyHit = {
  noteId: "n2",
  title: "Week 3 lecture",
  folder: "Uni/COMP336",
  matchIn: "body",
  matchStart: 0,
  matchEnd: 5,
  snippet: { text: "…compare with the boojy sidebar…", highlightStart: 18, highlightEnd: 23 },
  matchBlockId: "b7",
  _globalIndex: 1,
};
const titleHit = {
  noteId: "n1",
  title: "Boojy Notes Ideas",
  folder: null,
  matchIn: "title",
  matchStart: 0,
  matchEnd: 5,
  snippet: { text: "also in the body: boojy", highlightStart: 18, highlightEnd: 23 },
  matchBlockId: "b1",
  _globalIndex: 0,
};

const state: { noteData: Record<string, unknown>; sidebar: Record<string, unknown> } = {
  noteData: {},
  sidebar: {},
};

function setup(over: Record<string, unknown> = {}) {
  state.noteData = {
    n1: { title: "Boojy Notes Ideas", content: { blocks: [{ type: "p", text: "#work #home" }] } },
  };
  state.sidebar = {
    search: "",
    setSearch: vi.fn(),
    searchMode: false,
    searchResults: { results: [], totalCount: 0, groups: [] },
    activeResultIndex: 0,
    navigateResults: vi.fn(),
    getActiveResult: () => null,
    ...over,
  };
  const onOpenResult = vi.fn();
  const onClose = vi.fn();
  const utils = render(<SearchPalette onOpenResult={onOpenResult} onClose={onClose} />);
  return { ...utils, onOpenResult, onClose };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SearchPalette", () => {
  it("is a dialog with a focused field and nothing else before you type", () => {
    const { getByRole, getByLabelText, container } = setup();
    expect(getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(getByLabelText("Search notes")).toHaveFocus();
    expect(container.querySelectorAll("[data-search-index]")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/No results/);
  });

  it("types into the shared search state", () => {
    const setSearch = vi.fn();
    const { getByLabelText } = setup({ setSearch });
    fireEvent.change(getByLabelText("Search notes"), { target: { value: "boo" } });
    expect(setSearch).toHaveBeenCalledWith("boo");
  });

  it("shows title hits plain, body hits with one line of context, and the folder on the right", () => {
    const { container, getByText, queryByText } = setup({
      search: "boojy",
      searchMode: true,
      searchResults: { results: [titleHit, bodyHit], totalCount: 2, groups: [] },
    });
    const rows = container.querySelectorAll("[data-search-index]");
    expect(rows).toHaveLength(2);
    // Title hit: no snippet even though the body also matched.
    expect(rows[0].textContent).toContain("Boojy Notes Ideas");
    expect(rows[0].textContent).not.toContain("also in the body");
    // Body hit: the snippet, and the folder path with spaced separators.
    expect(rows[1].textContent).toContain("compare with the boojy sidebar");
    expect(getByText("Uni / COMP336")).toBeInTheDocument();
    expect(getByText("2 results")).toBeInTheDocument();
    expect(queryByText("title match")).not.toBeInTheDocument();
  });

  it("opens the highlighted result on Enter, with its matched block, then closes", () => {
    const { getByLabelText, onOpenResult, onClose } = setup({
      search: "boojy",
      searchMode: true,
      searchResults: { results: [titleHit, bodyHit], totalCount: 2, groups: [] },
      activeResultIndex: 1,
      getActiveResult: () => bodyHit,
    });
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "Enter" });
    expect(onOpenResult).toHaveBeenCalledWith("n2", "b7");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the highlight with the arrows and opens a clicked row", () => {
    const navigateResults = vi.fn();
    const { getByLabelText, getByText, onOpenResult } = setup({
      search: "boojy",
      searchMode: true,
      searchResults: { results: [titleHit, bodyHit], totalCount: 2, groups: [] },
      navigateResults,
    });
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "ArrowDown" });
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "ArrowUp" });
    expect(navigateResults).toHaveBeenNthCalledWith(1, "down");
    expect(navigateResults).toHaveBeenNthCalledWith(2, "up");
    fireEvent.click(getByText("Week 3 lecture"));
    expect(onOpenResult).toHaveBeenCalledWith("n2", "b7");
  });

  it("closes on Escape and on a click outside the panel", () => {
    const { getByLabelText, getByRole, onClose } = setup();
    fireEvent.keyDown(getByLabelText("Search notes"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says when nothing matches, and offers tags for a #", () => {
    const setSearch = vi.fn();
    const empty = { results: [], totalCount: 0, groups: [] };
    const none = setup({ search: "zzz", searchMode: true, searchResults: empty });
    expect(none.getByText(/No results for/)).toBeInTheDocument();
    cleanup();
    const tags = setup({ search: "#", searchMode: true, searchResults: empty, setSearch });
    expect(tags.getByText("All tags")).toBeInTheDocument();
    fireEvent.click(tags.getByText("#work"));
    expect(setSearch).toHaveBeenCalledWith("#work");
    expect(tags.queryByText(/No results for/)).not.toBeInTheDocument();
  });
});
