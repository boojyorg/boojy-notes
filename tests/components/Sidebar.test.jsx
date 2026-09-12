/** @vitest-environment jsdom */
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
    setExpanded: _sidebarOverrides.setExpanded ?? vi.fn(),
    filteredTree: _sidebarOverrides.filteredTree ?? [],
    fNotes: _sidebarOverrides.fNotes ?? [],
    renamingFolder: null,
    setRenamingFolder: _sidebarOverrides.setRenamingFolder ?? vi.fn(),
    renamingNote: _sidebarOverrides.renamingNote ?? null,
    setRenamingNote: _sidebarOverrides.setRenamingNote ?? vi.fn(),
    searchMode: _sidebarOverrides.searchMode ?? false,
    searchResults: _sidebarOverrides.searchResults ?? emptySearchResults,
    activeResultIndex: _sidebarOverrides.activeResultIndex ?? 0,
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
    renameNote: overrides.renameNote ?? vi.fn(),
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
    onOpenSearch: overrides.onOpenSearch,
    onRevealVault: overrides.onRevealVault,
    onChangeVault: overrides.onChangeVault,
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

  // Search is a palette over the window (2026-09-05). Its glyph sits on the
  // Notes row with New folder and the ··· (2026-09-12), not on the window's
  // own row above; the desktop panel never shows a field or results.
  it("opens the search palette from the Notes row's Search glyph and shows no field", () => {
    const onOpenSearch = vi.fn();
    const { getByLabelText } = renderSidebar({ onOpenSearch });
    const search = getByLabelText("Search notes");
    expect(search.closest(".sidebar-section-header")).not.toBeNull();
    expect(search.tagName).toBe("BUTTON");
    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    cleanup();
    // Still no field, whatever the search state.
    const r = renderSidebar({ searchFocused: true, search: "abc" });
    expect(r.container.querySelector("input")).toBeNull();
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

  it("double-click renames a folder and suppresses the second toggle", () => {
    const toggle = vi.fn();
    const setRenamingFolder = vi.fn();
    const filteredTree = [{ name: "Dbl Folder", _path: "Dbl Folder", children: [], notes: [] }];
    const { getByText } = renderSidebar({ filteredTree, toggle, setRenamingFolder });
    const row = getByText("Dbl Folder");
    // A real double-click is click(detail:1), click(detail:2), dblclick.
    fireEvent.click(row, { detail: 1 });
    fireEvent.click(row, { detail: 2 });
    fireEvent.dblClick(row, { detail: 2 });
    expect(setRenamingFolder).toHaveBeenCalledWith("Dbl Folder");
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("double-click on a note starts the inline rename", () => {
    const setRenamingNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Dbl Note" }]);
    const filteredTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
    const expanded = { F: true };
    const { getByText } = renderSidebar({ filteredTree, noteData, expanded, setRenamingNote });
    fireEvent.dblClick(getByText("Dbl Note"));
    expect(setRenamingNote).toHaveBeenCalledWith("n1");
  });

  it("renders an inline input for the renaming note and commits on Enter", () => {
    const renameNote = vi.fn();
    const setRenamingNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Old Name" }]);
    const filteredTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
    const expanded = { F: true };
    const { getByLabelText, queryByText } = renderSidebar({
      filteredTree,
      noteData,
      expanded,
      renameNote,
      setRenamingNote,
      renamingNote: "n1",
    });
    expect(queryByText("Old Name")).not.toBeInTheDocument();
    const input = getByLabelText("Rename note");
    fireEvent.keyDown(input, { key: "Enter", target: { value: "New Name" } });
    expect(renameNote).toHaveBeenCalledWith("n1", "New Name");
    expect(setRenamingNote).toHaveBeenCalledWith(null);
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

  it("draws search results in list order, folder beside the title, the active one marked", () => {
    // Two rows in the order the list holds them (a folder hit first): no
    // folder grouping reorders them, and the highlight is by position.
    const row = (noteId, title, folder) => ({
      noteId,
      title,
      folder,
      matchIn: "title",
      matchStart: 0,
      matchEnd: 6,
      snippet: null,
    });
    const searchResults = {
      results: [row("n2", "Result Plan", "Uni/COMP336"), row("n1", "Result Note", null)],
      totalCount: 2,
    };
    const { container, getByText } = renderSidebar({
      isMobile: true,
      searchMode: true,
      search: "Result",
      searchResults,
      activeResultIndex: 1,
    });
    expect(getByText("2 results")).toBeInTheDocument();
    const rows = container.querySelectorAll("[data-search-index]");
    expect([...rows].map((r) => r.getAttribute("data-search-index"))).toEqual(["0", "1"]);
    expect(rows[0].textContent).toContain("Result Plan");
    expect(rows[0].textContent).toContain("Uni / COMP336");
    expect(rows[1].textContent).toContain("Result Note");
    expect(rows[1].getAttribute("aria-current")).toBe("true");
    expect(rows[0].getAttribute("aria-current")).toBeNull();
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

  // ── The Notes row and its controls (2026-09-12) ───────────────────────────
  // One row labelled `Notes` heads the list, with Search, New folder and the
  // ··· menu on it, all three visible at rest. The storage folder's name is
  // not shown here at all; it lives in Settings → Storage. New note is the
  // labelled action row above it.

  it("labels the list Notes, not the storage folder, and carries the labelled New note", () => {
    const createNote = vi.fn();
    const { getByText, queryByText, getByRole } = renderSidebar({ createNote });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(queryByText("My Vault")).not.toBeInTheDocument();
    expect(queryByText("Folders")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "New note" }));
    expect(createNote).toHaveBeenCalledWith(null);
  });

  // Both stay reachable however far the tree is scrolled.
  it("keeps New note and the Notes row in one sticky block above the tree", () => {
    const { getByRole, getByText } = renderSidebar();
    const block = getByRole("button", { name: "New note" }).parentElement;
    expect(block.style.position).toBe("sticky");
    expect(getByText("Notes").closest("div").parentElement).toBe(block);
  });

  it("makes a root folder from the header's New folder control", () => {
    const createFolder = vi.fn();
    const { getByLabelText, queryByText } = renderSidebar({ createFolder });
    fireEvent.click(getByLabelText("New folder"));
    expect(createFolder).toHaveBeenCalledWith(null);
    // The old tree-style row is gone on desktop.
    expect(queryByText("New Folder")).not.toBeInTheDocument();
  });

  it("keeps the header and tree while a search runs: the palette owns the results", () => {
    const { getByText, queryByText } = renderSidebar({
      searchMode: true,
      search: "xyz",
      searchResults: { results: [], totalCount: 0 },
    });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(queryByText(/No results for/)).not.toBeInTheDocument();
  });

  it("keeps the header, and renders no empty tree, when the vault has no rows", () => {
    const { getByText, getByLabelText, queryByRole } = renderSidebar({
      filteredTree: [],
      fNotes: [],
    });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(getByLabelText("New folder")).toBeInTheDocument();
    // An empty tree fails axe's aria-required-children.
    expect(queryByRole("tree")).not.toBeInTheDocument();
  });

  it("keeps the header while a search narrows the tree to nothing", () => {
    const { getByText } = renderSidebar({ search: "zzz", filteredTree: [], fNotes: [] });
    expect(getByText("Notes")).toBeInTheDocument();
  });

  it("renders one tree named Notes: folders first, then root notes", () => {
    const noteData = buildNoteData([
      { id: "r1", title: "Loose Note" },
      { id: "n1", title: "Nested Note" },
    ]);
    const filteredTree = [{ name: "Zed Folder", _path: "Zed Folder", children: [], notes: ["n1"] }];
    const { getAllByRole, getByRole } = renderSidebar({
      noteData,
      filteredTree,
      fNotes: ["r1"],
      expanded: { "Zed Folder": true },
    });
    expect(getAllByRole("tree")).toHaveLength(1);
    const tree = getByRole("tree", { name: "Notes" });
    const rows = Array.from(tree.querySelectorAll('[role="treeitem"]')).map((r) =>
      r.textContent.trim(),
    );
    expect(rows[0]).toBe("Zed Folder");
    expect(rows[1]).toContain("Nested Note");
    expect(rows[2]).toContain("Loose Note");
  });

  it("marks the Notes row as the root drop target", () => {
    const { getByText } = renderSidebar({ fNotes: [] });
    expect(getByText("Notes").closest("[data-drop-root]")).not.toBeNull();
  });

  // ── The ··· menu ──────────────────────────────────────────────────────────
  // Sort is a preference flipped a few times a month, so it lives in the
  // menu rather than on the header; the current mode is a radio item.

  it("opens the vault menu with the current sort mode checked, and flips it", () => {
    const setSortMode = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderSidebar({
      setSortMode,
      sortMode: "recent",
    });
    expect(queryByRole("menu", { name: "List options" })).not.toBeInTheDocument();
    fireEvent.click(getByLabelText("List options"));
    const menu = getByRole("menu", { name: "List options" });
    expect(menu).toBeInTheDocument();
    expect(getByRole("menuitemradio", { name: "Most recent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(getByRole("menuitemradio", { name: "Alphabetical" }));
    expect(setSortMode).toHaveBeenCalledWith("alpha");
    expect(queryByRole("menu", { name: "List options" })).not.toBeInTheDocument();
  });

  it("offers Reveal only when a handler is provided, and never Collapse all or Change vault", () => {
    const { getByLabelText, queryByRole, unmount } = renderSidebar();
    fireEvent.click(getByLabelText("List options"));
    expect(queryByRole("menuitem", { name: /Reveal in Finder|Show in folder/ })).toBeNull();
    unmount();

    const onRevealVault = vi.fn();
    const r = renderSidebar({ onRevealVault });
    fireEvent.click(r.getByLabelText("List options"));
    // Both removed 2026-09-05: Change vault folder is Settings → Storage only.
    expect(r.queryByRole("menuitem", { name: "Collapse all folders" })).toBeNull();
    expect(r.queryByRole("menuitem", { name: "Change vault folder…" })).toBeNull();
    fireEvent.click(r.getByRole("menuitem", { name: /Reveal in Finder|Show in folder/ }));
    expect(onRevealVault).toHaveBeenCalled();
  });

  // The Notes row's three controls are visible at rest (2026-09-12). jsdom
  // can't compute the stylesheet, so assert the DOM hooks: the shared class,
  // inside the header its selectors scope to, keyboard-reachable, and no
  // hover-reveal variant left on any of them.
  it("keeps all three list controls keyboard-reachable and on the one class", () => {
    const { getByLabelText } = renderSidebar();
    for (const name of ["Search notes", "New folder", "List options"]) {
      const btn = getByLabelText(name);
      expect(btn.tabIndex).toBe(0);
      expect(btn.className).toBe("sidebar-section-action");
      expect(btn.closest(".sidebar-section-header")).not.toBeNull();
    }
  });

  it("lists New folder in the list menu as the keyboard route to the glyph", () => {
    const createFolder = vi.fn();
    const { getByLabelText, getByRole } = renderSidebar({ createFolder });
    fireEvent.click(getByLabelText("List options"));
    fireEvent.click(getByRole("menuitem", { name: "New folder" }));
    expect(createFolder).toHaveBeenCalledWith(null);
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
      // No document glyph — the row's only svg is the trailing ··· action.
      expect(row.querySelector("svg.lucide-file-text")).toBeNull();
    }
  });

  it("renders empty search message when searchMode is active but results are empty", () => {
    const { getByText } = renderSidebar({
      isMobile: true,
      searchMode: true,
      search: "xyz",
      searchResults: { results: [], totalCount: 0 },
    });
    expect(getByText(/No results for/)).toBeInTheDocument();
    expect(getByText(/Try searching with #tags/)).toBeInTheDocument();
  });
});

// ── Mobile branch ─────────────────────────────────────────────────────────────
// Pins the mobile layout's exact current geometry so the shared-component
// consolidation cannot drift it: one tree, no headers, inline action rows.

describe("Sidebar (mobile)", () => {
  const folderTree = [{ name: "Work", _path: "Work", notes: ["n1"], children: [] }];
  const noteData = buildNoteData([
    { id: "n1", title: "Filed" },
    { id: "n2", title: "Loose" },
  ]);

  it("renders the search field and no desktop header", () => {
    const { getByLabelText, queryByTestId } = renderSidebar({ isMobile: true });
    expect(getByLabelText("Search notes")).toBeInTheDocument();
    expect(queryByTestId("wordmark-settings-button")).not.toBeInTheDocument();
  });

  it("keeps one tree with inline New Folder / New Note rows and no section headers", () => {
    const createFolder = vi.fn();
    const createNote = vi.fn();
    const { getAllByRole, getByText, queryByText } = renderSidebar({
      isMobile: true,
      filteredTree: folderTree,
      fNotes: ["n2"],
      noteData,
      createFolder,
      createNote,
    });
    expect(getAllByRole("tree")).toHaveLength(1);
    expect(queryByText("Folders")).not.toBeInTheDocument();
    expect(queryByText("Notes")).not.toBeInTheDocument();

    const newFolder = getByText("New Folder").closest("button");
    const newNote = getByText("New Note").closest("button");
    expect(newFolder).toHaveAttribute("role", "treeitem");
    expect(newNote).toHaveAttribute("role", "treeitem");

    fireEvent.click(newFolder);
    expect(createFolder).toHaveBeenCalledTimes(1);
    fireEvent.click(newNote);
    expect(createNote).toHaveBeenCalledWith(null);
  });

  it("keeps the mobile row geometry (17px type, 8px gap, its own insets)", () => {
    const { getByText } = renderSidebar({ isMobile: true, fNotes: ["n2"], noteData });
    const newFolder = getByText("New Folder").closest("button");
    const newNote = getByText("New Note").closest("button");
    expect(newFolder).toHaveStyle({ fontSize: "17px", gap: "8px", padding: "12px 16px 12px 10px" });
    expect(newNote).toHaveStyle({ fontSize: "17px", gap: "8px", padding: "12px 16px 12px 26px" });
    expect(newNote.style.borderLeft).toBe("3px solid transparent");
    // Both carry the accent "+" glyph in a 17px column.
    const plus = newFolder.querySelector("span");
    expect(plus.textContent).toBe("+");
    expect(plus).toHaveStyle({ width: "17px", color: "#A4CACE" });
  });

  it("hides the inline rows while a search is typed", () => {
    const { queryByText } = renderSidebar({
      isMobile: true,
      search: "abc",
      fNotes: ["n2"],
      noteData,
    });
    expect(queryByText("New Folder")).not.toBeInTheDocument();
    expect(queryByText("New Note")).not.toBeInTheDocument();
  });
});

// ── Tag chips ─────────────────────────────────────────────────────────────────

describe("Sidebar tag chips", () => {
  const taggedData = {
    n1: { title: "A", content: { blocks: [{ text: "#work and #home" }] } },
    n2: { title: "B", content: { blocks: [{ text: "#work again" }] } },
  };
  const oneResult = {
    results: [{ noteId: "n1", title: "A", matchIn: "title", snippet: null }],
    totalCount: 1,
  };

  it("lists tags by count above search results, then a Notes heading", () => {
    const setSearch = vi.fn();
    const { getByText, getAllByRole } = renderSidebar({
      isMobile: true,
      searchMode: true,
      search: "#",
      searchResults: oneResult,
      noteData: taggedData,
      setSearch,
    });
    expect(getByText("Tags")).toBeInTheDocument();
    expect(getByText("Notes")).toBeInTheDocument();
    const chips = getAllByRole("button").filter((b) => b.textContent.startsWith("#"));
    expect(chips.map((c) => c.textContent)).toEqual(["#work2", "#home1"]);
    fireEvent.click(chips[1]);
    expect(setSearch).toHaveBeenCalledWith("#home");
  });

  it("shows All Tags for a bare # with no results, and filters by the typed prefix", () => {
    const { getByText, queryByText } = renderSidebar({
      isMobile: true,
      searchMode: true,
      search: "#",
      searchResults: emptySearchResults,
      noteData: taggedData,
    });
    expect(getByText("All Tags")).toBeInTheDocument();
    expect(queryByText(/No results for/)).not.toBeInTheDocument();
    cleanup();
    const filtered = renderSidebar({
      isMobile: true,
      searchMode: true,
      search: "#ho",
      searchResults: emptySearchResults,
      noteData: taggedData,
    });
    expect(filtered.getByText("Tags")).toBeInTheDocument();
    expect(filtered.getByText("#home")).toBeInTheDocument();
    expect(filtered.queryByText("#work")).not.toBeInTheDocument();
  });
});
