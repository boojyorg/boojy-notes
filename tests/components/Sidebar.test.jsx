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
      BRAND: { orange: "#f90" },
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
  selectionStyle: "B",
  collapsed: false,
  setCollapsed: vi.fn(),
  rightPanel: false,
  setRightPanel: vi.fn(),
  chromeBg: "#222",
  activeTabBg: "#1C1C20",
  tabFlip: false,
  rightPanelWidth: 220,
  topBarEdge: "B",
  sidebarHandles: { current: [] },
  rightPanelHandles: { current: [] },
  isDragging: { current: false },
  startDrag: vi.fn(),
  startRightDrag: vi.fn(),
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

vi.mock("../../src/context/SettingsContext", () => ({
  useSettings: () => ({
    settingsFontSize: 15,
    settingsOpen: false,
    setSettingsOpen: vi.fn(),
    settingsTab: "profile",
    setSettingsTab: vi.fn(),
    user: null,
    profile: null,
  }),
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
    trashedNotes: _sidebarOverrides.trashedNotes ?? {},
    trashExpanded: _sidebarOverrides.trashExpanded ?? false,
    setTrashExpanded: _sidebarOverrides.setTrashExpanded ?? vi.fn(),
    searchMode: _sidebarOverrides.searchMode ?? false,
    searchResults: _sidebarOverrides.searchResults ?? emptySearchResults,
    activeResultIndex: 0,
    navigateResults: vi.fn(),
    clearSearch: vi.fn(),
    getActiveResult: () => null,
    customFolders: [],
    setCustomFolders: vi.fn(),
    sidebarOrder: {},
    setSidebarOrder: vi.fn(),
    folderList: [],
    trashedNotesRef: { current: new Map() },
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
    emptyAllTrash: noop,
    handleSearchResultOpen: overrides.handleSearchResultOpen ?? vi.fn(),
    selectedNotes: new Set(),
    handleNoteClick: null,
    clearSelection: noop,
  };

  return render(<Sidebar {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _sidebarOverrides = {};
});

afterEach(() => {
  cleanup();
  _sidebarOverrides = {};
});

describe("Sidebar", () => {
  it("renders the search input area", () => {
    const { getByText } = renderSidebar();
    expect(getByText("Search")).toBeInTheDocument();
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

  it("renders the Trash section", () => {
    const { getAllByText } = renderSidebar();
    const trashElements = getAllByText("Trash");
    expect(trashElements.length).toBeGreaterThan(0);
    expect(trashElements[0]).toBeInTheDocument();
  });

  it("calls createNote when the New Note button is clicked", () => {
    const createNote = vi.fn();
    const { getByText } = renderSidebar({ createNote });
    fireEvent.click(getByText("New Note"));
    expect(createNote).toHaveBeenCalledWith(null);
  });

  it("renders 'No notes found' when searchMode is active but results are empty", () => {
    const { getByText } = renderSidebar({
      searchMode: true,
      search: "xyz",
      searchResults: { results: [], groups: [], totalCount: 0 },
    });
    expect(getByText("No notes found")).toBeInTheDocument();
  });
});
