/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// jsdom does not implement scrollIntoView — stub it globally.
Element.prototype.scrollIntoView = vi.fn();

// ── Static mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        dark: "#1a1a1e",
        editor: "#1a1a1e",
        elevated: "#2a2a2e",
        surface: "#333",
        divider: "#444",
        hover: "#555",
        darkest: "#111",
      },
      ACCENT: { primary: "#A4CACE" },
      modalShadow: "0 8px 24px rgba(0,0,0,0.4)",
      SEMANTIC: { error: "#ef4444" },
      link: { color: "#7AA2F7", underline: "#7AA2F744", hoverBg: "#7AA2F710" },
      searchInputBg: "#222",
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

const layoutState = {
  sidebarWidth: 220,
  accentColor: "#A4CACE",
  collapsed: false,
  toggleSidebar: vi.fn(),
  chromeBg: "#222",
  sidebarHandles: { current: [] },
  isDragging: { current: false },
  startDrag: vi.fn(),
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteData: () => ({ noteData: _sidebarOverrides.noteData ?? {} }),
  useNoteDataActions: () => ({
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
  }),
  NoteDataProvider: ({ children }) => children,
}));

const settingsState = {
  settingsFontSize: 15,
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
};

vi.mock("../../src/context/SettingsContext", () => ({
  useSettings: () => settingsState,
  SettingsProvider: ({ children }) => children,
}));

// ── Sidebar context mock ─────────────────────────────────────────────────────
// We use a module-level variable so the mock can read overrides set per test.
let _sidebarOverrides = {};

const emptySearchResults = {
  results: [],
  groups: [],
  totalCount: 0,
};

vi.mock("../../src/context/SidebarContext", () => ({
  useSidebar: () => ({
    search: _sidebarOverrides.search ?? "",
    setSearch: _sidebarOverrides.setSearch ?? vi.fn(),
    searchFocused: _sidebarOverrides.searchFocused ?? false,
    setSearchFocused: _sidebarOverrides.setSearchFocused ?? vi.fn(),
    searchInputRef: _sidebarOverrides.searchInputRef ?? { current: null },
    sidebarScrollRef: _sidebarOverrides.sidebarScrollRef ?? { current: null },
    expanded: _sidebarOverrides.expanded ?? {},
    setExpanded: vi.fn(),
    filteredTree: _sidebarOverrides.filteredTree ?? [],
    fNotes: _sidebarOverrides.fNotes ?? [],
    renamingFolder: null,
    setRenamingFolder: vi.fn(),
    searchMode: _sidebarOverrides.searchMode ?? false,
    searchResults: _sidebarOverrides.searchResults ?? emptySearchResults,
    activeResultIndex: 0,
    navigateResults: vi.fn(),
    clearSearch: vi.fn(),
    getActiveResult: () => null,
    customFolders: [],
    setCustomFolders: vi.fn(),
    folderList: [],
    sortMode: _sidebarOverrides.sortMode ?? "recent",
    setSortMode: _sidebarOverrides.setSortMode ?? vi.fn(),
  }),
  SidebarProvider: ({ children }) => children,
}));

// ── Import component after mocks ──────────────────────────────────────────────
import Sidebar from "../../src/components/Sidebar.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const noop = () => {};

function buildNoteData(notes) {
  return Object.fromEntries(notes.map(({ id, title }) => [id, { title, blocks: [] }]));
}

function renderSidebar(overrides = {}) {
  // Set sidebar context overrides before rendering
  _sidebarOverrides = overrides;

  const props = {
    activeNote: overrides.activeNote ?? null,
    toggle: overrides.toggle ?? vi.fn(),
    openNote: overrides.openNote ?? vi.fn(),
    setCtxMenu: overrides.setCtxMenu ?? vi.fn(),
    renameFolder: noop,
    createFolder: overrides.createFolder ?? vi.fn(),
    createNote: overrides.createNote ?? vi.fn(),
    handleSidebarPointerDown: noop,
    handleSearchResultOpen: overrides.handleSearchResultOpen ?? vi.fn(),
    selectedNotes: new Set(),
    handleNoteClick: null,
    clearSelection: noop,
    isMobile: overrides.isMobile ?? false,
  };

  return render(<Sidebar {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _sidebarOverrides = {};
  settingsState.setSettingsOpen = vi.fn();
});

afterEach(() => {
  cleanup();
  _sidebarOverrides = {};
});

describe("Sidebar", () => {
  // The header's toggle is the same action as the pinned one in EditorChrome:
  // it hides an in-flow sidebar and closes an overlaying one, and the sidebar
  // itself doesn't need to know which of those it currently is.
  it("puts the panel toggle in the sidebar header and toggles on click", () => {
    const { getByTitle } = renderSidebar();
    fireEvent.click(getByTitle("Hide sidebar"));
    expect(layoutState.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("renders the Search action row", () => {
    const { getByText } = renderSidebar();
    expect(getByText("Search")).toBeInTheDocument();
  });

  it("focuses search when the Search action row is clicked", () => {
    const setSearchFocused = vi.fn();
    const { getByText } = renderSidebar({ setSearchFocused });
    fireEvent.click(getByText("Search"));
    expect(setSearchFocused).toHaveBeenCalledWith(true);
  });

  it("swaps the Search row for a field once search is engaged", () => {
    const { queryByText, getByLabelText } = renderSidebar({ searchFocused: true });
    expect(getByLabelText("Search notes")).toBeInTheDocument();
    expect(queryByText("Search")).not.toBeInTheDocument();
  });

  it("renders folder names from filteredTree", () => {
    const filteredTree = [
      { name: "My Folder", _path: "My Folder", children: [], notes: [] },
      { name: "Another Folder", _path: "Another Folder", children: [], notes: [] },
    ];
    const { getByText } = renderSidebar({ filteredTree });
    expect(getByText("My Folder")).toBeInTheDocument();
    expect(getByText("Another Folder")).toBeInTheDocument();
  });

  it("renders note titles under expanded folders", () => {
    const noteData = buildNoteData([
      { id: "n1", title: "First Note" },
      { id: "n2", title: "Second Note" },
    ]);
    const filteredTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1", "n2"],
      },
    ];
    const expanded = { "My Folder": true };
    const { getByText } = renderSidebar({ filteredTree, noteData, expanded });
    expect(getByText("First Note")).toBeInTheDocument();
    expect(getByText("Second Note")).toBeInTheDocument();
  });

  it("hides note titles when folder is collapsed", () => {
    const noteData = buildNoteData([{ id: "n1", title: "Hidden Note" }]);
    const filteredTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1"],
      },
    ];
    const expanded = { "My Folder": false };
    const { queryByText } = renderSidebar({ filteredTree, noteData, expanded });
    expect(queryByText("Hidden Note")).not.toBeInTheDocument();
  });

  it("calls openNote when a note is clicked", () => {
    const openNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Clickable Note" }]);
    const filteredTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1"],
      },
    ];
    const expanded = { "My Folder": true };
    const { getByText } = renderSidebar({ filteredTree, noteData, expanded, openNote });
    fireEvent.click(getByText("Clickable Note"));
    expect(openNote).toHaveBeenCalledWith("n1");
  });

  it("calls toggle when a folder is clicked", () => {
    const toggle = vi.fn();
    const filteredTree = [
      { name: "Toggle Folder", _path: "Toggle Folder", children: [], notes: [] },
    ];
    const { getByText } = renderSidebar({ filteredTree, toggle });
    fireEvent.click(getByText("Toggle Folder"));
    expect(toggle).toHaveBeenCalledWith("Toggle Folder");
  });

  it("renders folder rows without a disclosure chevron but keeps aria-expanded", () => {
    const noteData = buildNoteData([{ id: "n1", title: "Child Note" }]);
    const filteredTree = [
      { name: "Open Folder", _path: "Open Folder", children: [], notes: ["n1"] },
      { name: "Shut Folder", _path: "Shut Folder", children: [], notes: ["n1"] },
    ];
    const { getByText } = renderSidebar({
      filteredTree,
      noteData,
      expanded: { "Open Folder": true },
    });
    for (const [name, open] of [
      ["Open Folder", "true"],
      ["Shut Folder", "false"],
    ]) {
      const row = getByText(name).closest('[role="treeitem"]');
      expect(row.getAttribute("aria-expanded")).toBe(open);
      expect(row.querySelector(".lucide-chevron-right, .lucide-chevron-down")).toBeNull();
    }
  });

  it("shows search results when in searchMode with results", () => {
    const searchResults = {
      results: [
        {
          noteId: "n1",
          title: "Result Note",
          matchIn: "title",
          matchStart: 0,
          matchEnd: 6,
          snippet: null,
          _globalIndex: 0,
        },
      ],
      groups: [
        {
          folderId: null,
          folderName: null,
          results: [
            {
              noteId: "n1",
              title: "Result Note",
              matchIn: "title",
              matchStart: 0,
              matchEnd: 6,
              snippet: null,
              _globalIndex: 0,
            },
          ],
        },
      ],
      totalCount: 1,
    };
    const { container, getByText } = renderSidebar({
      searchMode: true,
      search: "Result",
      searchResults,
    });
    expect(getByText("1 result")).toBeInTheDocument();
    expect(container.textContent).toContain("Result Note");
  });

  it("renders no Trash/Recently Deleted section", () => {
    const { queryByText } = renderSidebar();
    expect(queryByText("Trash")).not.toBeInTheDocument();
    expect(queryByText("Recently Deleted")).not.toBeInTheDocument();
    const mobile = renderSidebar({ isMobile: true });
    expect(mobile.queryByText("Recently Deleted")).not.toBeInTheDocument();
  });

  it("opens Settings directly from the wordmark without an app menu", () => {
    const { getByTestId, queryByRole, queryByText } = renderSidebar();
    fireEvent.click(getByTestId("wordmark-settings-button"));
    expect(queryByRole("menu")).not.toBeInTheDocument();
    expect(queryByText("About")).not.toBeInTheDocument();
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(true);
  });

  it("calls createNote from the New note action row", () => {
    const createNote = vi.fn();
    const { getByText } = renderSidebar({ createNote });
    fireEvent.click(getByText("New note"));
    expect(createNote).toHaveBeenCalledWith(null);
  });

  it("renders the Folders section header with a New folder button", () => {
    const createFolder = vi.fn();
    const { getByText, getByLabelText, queryByText } = renderSidebar({ createFolder });
    expect(getByText("Folders")).toBeInTheDocument();
    fireEvent.click(getByLabelText("New folder"));
    expect(createFolder).toHaveBeenCalled();
    // The old tree-style row is gone on desktop.
    expect(queryByText("New Folder")).not.toBeInTheDocument();
  });

  it("hides the Folders header while searching", () => {
    const { queryByText } = renderSidebar({
      searchMode: true,
      search: "xyz",
      searchResults: { results: [], groups: [], totalCount: 0 },
    });
    expect(queryByText("Folders")).not.toBeInTheDocument();
  });

  it("keeps the Folders header when there are no folders", () => {
    const { getByText, getByLabelText } = renderSidebar({ filteredTree: [] });
    expect(getByText("Folders")).toBeInTheDocument();
    expect(getByLabelText("New folder")).toBeInTheDocument();
  });

  it("renders the Notes section header when there are loose root notes", () => {
    const noteData = buildNoteData([{ id: "r1", title: "Loose Note" }]);
    const { getByText } = renderSidebar({ noteData, fNotes: ["r1"] });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(getByText("Loose Note")).toBeInTheDocument();
  });

  // Reversed on purpose when the sort control moved onto this header: it is
  // both the visible root drop target and the only place to change ordering,
  // and both are wanted precisely when every note is inside a folder.
  it("keeps the Notes section header when there are no loose root notes", () => {
    const { getByText, queryByRole } = renderSidebar({ fNotes: [] });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(getByText("Folders")).toBeInTheDocument();
    // ...but no empty tree, which would fail axe's aria-required-children.
    expect(queryByRole("tree", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("hides the Notes section header when a search matches no root note", () => {
    const { queryByText } = renderSidebar({ search: "zzz", fNotes: [] });
    expect(queryByText("Notes")).not.toBeInTheDocument();
  });

  it("marks the Notes header as the root drop target", () => {
    const { getByText } = renderSidebar({ fNotes: [] });
    const header = getByText("Notes").closest("[data-drop-root]");
    expect(header).not.toBeNull();
  });

  // ── Sort control ──────────────────────────────────────────────────────────

  it("shows the active sort mode in the trigger's accessible name", () => {
    const { getByLabelText } = renderSidebar({ sortMode: "alpha" });
    expect(getByLabelText("Sort notes: Alphabetical")).toBeInTheDocument();
  });

  it("opens a menu with the active mode checked", () => {
    const { getByLabelText, getByRole } = renderSidebar({ sortMode: "recent" });
    fireEvent.click(getByLabelText("Sort notes: Most recent"));
    expect(getByRole("menu", { name: "Sort notes" })).toBeInTheDocument();
    expect(getByRole("menuitemradio", { name: "Most recent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(getByRole("menuitemradio", { name: "Alphabetical" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("sets the chosen mode and closes", () => {
    const setSortMode = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderSidebar({ setSortMode });
    fireEvent.click(getByLabelText("Sort notes: Most recent"));
    fireEvent.click(getByRole("menuitemradio", { name: "Alphabetical" }));
    expect(setSortMode).toHaveBeenCalledWith("alpha");
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
  });

  it("closes the menu on Escape without changing the mode", () => {
    const setSortMode = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderSidebar({ setSortMode });
    const trigger = getByLabelText("Sort notes: Most recent");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menu", { name: "Sort notes" }), { key: "Escape" });
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
    expect(setSortMode).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("closes on Tab without blocking normal focus movement", () => {
    const { getByLabelText, getByRole, queryByRole } = renderSidebar();
    const trigger = getByLabelText("Sort notes: Most recent");
    trigger.focus();
    fireEvent.click(trigger);

    const defaultAllowed = fireEvent.keyDown(getByRole("menu", { name: "Sort notes" }), {
      key: "Tab",
    });

    expect(defaultAllowed).toBe(true);
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
    // jsdom does not perform the browser's default Tab move; the handler's
    // starting point is therefore observable here.
    expect(trigger).toHaveFocus();
  });

  // Hover-only reveal would cost a keyboard user the control outright.
  it("keeps both header controls reachable and visible when focused", () => {
    const { getByLabelText } = renderSidebar();
    for (const name of ["New folder", "Sort notes: Most recent"]) {
      const btn = getByLabelText(name);
      expect(Number(btn.style.opacity)).toBeGreaterThan(0);
      fireEvent.focus(btn);
      expect(btn.style.opacity).toBe("1");
    }
  });

  it("renders note rows without a file glyph, at any depth", () => {
    const noteData = buildNoteData([
      { id: "r1", title: "Loose Note" },
      { id: "n1", title: "Nested Note" },
    ]);
    const filteredTree = [{ name: "My Folder", _path: "My Folder", children: [], notes: ["n1"] }];
    const { getByText } = renderSidebar({
      noteData,
      fNotes: ["r1"],
      filteredTree,
      expanded: { "My Folder": true },
    });
    for (const title of ["Loose Note", "Nested Note"]) {
      const row = getByText(title).closest("[data-note-id]");
      expect(row).not.toBeNull();
      expect(row.querySelector("svg")).toBeNull();
    }
  });

  it("renders empty search message when searchMode is active but results are empty", () => {
    const { getByText } = renderSidebar({
      searchMode: true,
      search: "xyz",
      searchResults: { results: [], groups: [], totalCount: 0 },
    });
    expect(getByText(/No results for/)).toBeInTheDocument();
    expect(getByText(/Try searching with #tags/)).toBeInTheDocument();
  });
});
