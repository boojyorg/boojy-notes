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
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
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
  // The column is `visibility: hidden` once hidden (2026-09-14), so a mock
  // that leaves this out renders a sidebar nothing can query.
  sidebarVisible: true,
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
    sidebarScrollRef: _sidebarOverrides.sidebarScrollRef ?? { current: null },
    expanded: _sidebarOverrides.expanded ?? {},
    setExpanded: _sidebarOverrides.setExpanded ?? vi.fn(),
    folderTree: _sidebarOverrides.folderTree ?? [],
    sortedRootNotes: _sidebarOverrides.sortedRootNotes ?? [],
    tags: _sidebarOverrides.tags ?? extractAllTags(_sidebarOverrides.noteData ?? {}),
    renamingFolder: _sidebarOverrides.renamingFolder ?? null,
    setRenamingFolder: _sidebarOverrides.setRenamingFolder ?? vi.fn(),
    renamingNote: _sidebarOverrides.renamingNote ?? null,
    setRenamingNote: _sidebarOverrides.setRenamingNote ?? vi.fn(),
    searchResults: _sidebarOverrides.searchResults ?? emptySearchResults,
    clearSearch: vi.fn(),
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
import { extractAllTags } from "../../src/utils/tags";
import {
  ROW_INSET,
  SIDEBAR_TREE_INSET,
  SPINE,
  TEXT_COL,
  TREE_INDENT,
} from "../../src/constants/layout.js";

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
    ctxMenuFolderId: overrides.ctxMenuFolderId ?? null,
    renameFolder: noop,
    createFolder: overrides.createFolder ?? vi.fn(),
    createNote: overrides.createNote ?? vi.fn(),
    handleSidebarPointerDown: noop,
    selectedNotes: new Set(),
    handleNoteClick: null,
    clearSelection: noop,
    onOpenSearch: overrides.onOpenSearch,
    notesDir: overrides.notesDir ?? "/v/University",
    vaults: overrides.vaults ?? [],
    otherFiles: overrides.otherFiles ?? [],
    onSwitchVault: overrides.onSwitchVault,
    onManageVaults: overrides.onManageVaults,
    onOpenFile: overrides.onOpenFile,
    trashFile: overrides.trashFile,
  };

  return render(<Sidebar {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem("boojy-vault-view");
  _sidebarOverrides = {};
  settingsState.setSettingsOpen = vi.fn();
});

afterEach(() => {
  cleanup();
  _sidebarOverrides = {};
});

describe("Sidebar", () => {
  // The header's toggle is the same action as the pinned one in EditorChrome.
  it("puts the panel toggle in the sidebar header and toggles on click", () => {
    const { getByLabelText } = renderSidebar();
    fireEvent.click(getByLabelText("Toggle sidebar"));
    expect(layoutState.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  // Search is a palette over the window (2026-09-05). Its glyph sits on the
  // window's own row, a chrome button immediately left of the toggle
  // (2026-09-16; on the Notes row from 2026-09-12); the desktop panel never
  // shows a field or results.
  it("opens the search palette from the header's Search button, beside the toggle", () => {
    const onOpenSearch = vi.fn();
    const { getByLabelText } = renderSidebar({ onOpenSearch });
    const search = getByLabelText("Search notes");
    expect(search.closest(".sidebar-section-header")).toBeNull();
    expect(search.tagName).toBe("BUTTON");
    expect(search.nextElementSibling).toBe(getByLabelText("Toggle sidebar"));
    expect(search.style.width).toBe(getByLabelText("Toggle sidebar").style.width);
    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    cleanup();
    // Still no field, whatever the search state.
    const r = renderSidebar({ search: "abc" });
    expect(r.container.querySelector("input")).toBeNull();
  });

  it("renders folder names from folderTree", () => {
    const folderTree = [
      { name: "My Folder", _path: "My Folder", children: [], notes: [] },
      { name: "Another Folder", _path: "Another Folder", children: [], notes: [] },
    ];
    const { getByText } = renderSidebar({ folderTree });
    expect(getByText("My Folder")).toBeInTheDocument();
    expect(getByText("Another Folder")).toBeInTheDocument();
  });

  it("renders note titles under expanded folders", () => {
    const noteData = buildNoteData([
      { id: "n1", title: "First Note" },
      { id: "n2", title: "Second Note" },
    ]);
    const folderTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1", "n2"],
      },
    ];
    const expanded = { "My Folder": true };
    const { getByText } = renderSidebar({ folderTree, noteData, expanded });
    expect(getByText("First Note")).toBeInTheDocument();
    expect(getByText("Second Note")).toBeInTheDocument();
  });

  it("reads an unnamed note as a muted `Untitled`, never a blank row", () => {
    const noteData = buildNoteData([
      { id: "n1", title: "" },
      { id: "n2", title: "Untitled" },
    ]);
    const folderTree = [
      { name: "My Folder", _path: "My Folder", children: [], notes: ["n1", "n2"] },
    ];
    const { getAllByText } = renderSidebar({
      folderTree,
      noteData,
      expanded: { "My Folder": true },
    });
    const [unnamed, named] = getAllByText("Untitled");
    expect(unnamed.closest("[data-note-id]")).toHaveAttribute("data-note-id", "n1");
    expect(unnamed).toHaveStyle({ color: "#666" });
    expect(named.closest("[data-note-id]")).toHaveAttribute("data-note-id", "n2");
    expect(named.style.color).toBe("");
  });

  it("hides note titles when folder is collapsed", () => {
    const noteData = buildNoteData([{ id: "n1", title: "Hidden Note" }]);
    const folderTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1"],
      },
    ];
    const expanded = { "My Folder": false };
    const { queryByText } = renderSidebar({ folderTree, noteData, expanded });
    expect(queryByText("Hidden Note")).not.toBeInTheDocument();
  });

  it("calls openNote when a note is clicked", () => {
    const openNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Clickable Note" }]);
    const folderTree = [
      {
        name: "My Folder",
        _path: "My Folder",
        children: [],
        notes: ["n1"],
      },
    ];
    const expanded = { "My Folder": true };
    const { getByText } = renderSidebar({ folderTree, noteData, expanded, openNote });
    fireEvent.click(getByText("Clickable Note"));
    expect(openNote).toHaveBeenCalledWith("n1");
  });

  it("calls toggle when a folder is clicked", () => {
    const toggle = vi.fn();
    const folderTree = [{ name: "Toggle Folder", _path: "Toggle Folder", children: [], notes: [] }];
    const { getByText } = renderSidebar({ folderTree, toggle });
    fireEvent.click(getByText("Toggle Folder"));
    expect(toggle).toHaveBeenCalledWith("Toggle Folder");
  });

  // No double-click rename on a folder (2026-09-16): the first click of the
  // pair toggled the folder under the field. Every click toggles; Rename is
  // the folder menu's.
  it("double-click on a folder only toggles it, twice, and renames nothing", () => {
    const toggle = vi.fn();
    const setRenamingFolder = vi.fn();
    const folderTree = [{ name: "Dbl Folder", _path: "Dbl Folder", children: [], notes: [] }];
    const { getByText } = renderSidebar({ folderTree, toggle, setRenamingFolder });
    const row = getByText("Dbl Folder");
    fireEvent.click(row, { detail: 1 });
    fireEvent.click(row, { detail: 2 });
    fireEvent.dblClick(row, { detail: 2 });
    expect(setRenamingFolder).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("double-click on a note starts the inline rename", () => {
    const setRenamingNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Dbl Note" }]);
    const folderTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
    const expanded = { F: true };
    const { getByText } = renderSidebar({ folderTree, noteData, expanded, setRenamingNote });
    fireEvent.dblClick(getByText("Dbl Note"));
    expect(setRenamingNote).toHaveBeenCalledWith("n1");
  });

  it("renders an inline input for the renaming note and commits on Enter", () => {
    const renameNote = vi.fn();
    const setRenamingNote = vi.fn();
    const noteData = buildNoteData([{ id: "n1", title: "Old Name" }]);
    const folderTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
    const expanded = { F: true };
    const { getByLabelText, queryByText } = renderSidebar({
      folderTree,
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

  // The rename field is invisible (2026-09-16): no border, fill or padding,
  // the row's own font, so the name does not move when it appears and the
  // selection is the whole signal; the row stands down under it (the
  // `is-renaming` hook, which GlobalStyles turns into no pill and no
  // trailing actions; jsdom cannot evaluate that sheet, so the hook is what
  // is asserted here).
  describe("the inline rename field", () => {
    const invisible = (input) => {
      expect(input.style.border).toBe("0px");
      expect(input.style.padding).toBe("0px");
      expect(input.style.background).toBe("transparent");
      expect(input.style.fontSize).toBe("14px");
      expect(input.style.fontWeight).toBe("400");
    };

    it("is invisible under a note's name and the row stands down", () => {
      const noteData = buildNoteData([{ id: "n1", title: "Old Name" }]);
      const folderTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
      const { getByLabelText } = renderSidebar({
        folderTree,
        noteData,
        expanded: { F: true },
        renamingNote: "n1",
      });
      const input = getByLabelText("Rename note");
      invisible(input);
      const row = input.closest('[role="treeitem"]');
      expect(row.classList.contains("is-renaming")).toBe(true);
      // The whole name is selected, Finder-style, ready to overwrite.
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Old Name".length]);
    });

    it("is invisible under a folder's name, selects it, and the row stands down", () => {
      const noteData = buildNoteData([{ id: "n1", title: "Child" }]);
      const folderTree = [{ name: "Work", _path: "Work", children: [], notes: ["n1"] }];
      const { getByLabelText } = renderSidebar({
        folderTree,
        noteData,
        expanded: { Work: true },
        renamingFolder: "Work",
      });
      const input = getByLabelText("Rename folder");
      invisible(input);
      const row = input.closest('[role="treeitem"]');
      expect(row.classList.contains("is-renaming")).toBe(true);
      // Until 2026-09-16 the folder field opened with the caret at the end.
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Work".length]);
    });
  });

  it("a note's rename field renames once on Enter (the blur after it is not a second), and never on Escape", () => {
    const noteData = buildNoteData([{ id: "n1", title: "Old" }]);
    const renameNote = vi.fn();
    const setRenamingNote = vi.fn();
    const folderTree = [{ name: "F", _path: "F", children: [], notes: ["n1"] }];
    const first = renderSidebar({
      folderTree,
      noteData,
      expanded: { F: true },
      renamingNote: "n1",
      renameNote,
      setRenamingNote,
    });
    const input = first.getByLabelText("Rename note");
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(renameNote).toHaveBeenCalledExactlyOnceWith("n1", "New");
    expect(setRenamingNote).toHaveBeenCalledWith(null);
    first.unmount();

    renameNote.mockClear();
    const second = renderSidebar({
      folderTree,
      noteData,
      expanded: { F: true },
      renamingNote: "n1",
      renameNote,
      setRenamingNote,
    });
    const again = second.getByLabelText("Rename note");
    fireEvent.change(again, { target: { value: "Typed" } });
    fireEvent.keyDown(again, { key: "Escape" });
    fireEvent.blur(again);
    expect(renameNote).not.toHaveBeenCalled();
  });

  it("renders folder rows without a disclosure chevron but keeps aria-expanded", () => {
    const noteData = buildNoteData([{ id: "n1", title: "Child Note" }]);
    const folderTree = [
      { name: "Open Folder", _path: "Open Folder", children: [], notes: ["n1"] },
      { name: "Shut Folder", _path: "Shut Folder", children: [], notes: ["n1"] },
    ];
    const { getByText } = renderSidebar({
      folderTree,
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

  it("renders no Trash/Recently Deleted section", () => {
    const { queryByText } = renderSidebar();
    expect(queryByText("Trash")).not.toBeInTheDocument();
    expect(queryByText("Recently Deleted")).not.toBeInTheDocument();
  });

  it("opens Settings directly from the wordmark without an app menu", () => {
    const { getByTestId, queryByRole, queryByText } = renderSidebar();
    fireEvent.click(getByTestId("wordmark-settings-button"));
    expect(queryByRole("menu")).not.toBeInTheDocument();
    expect(queryByText("About")).not.toBeInTheDocument();
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(true);
  });

  // ── The Notes row and its controls (2026-09-12; Sort since 2026-09-16) ───
  // One row labelled `Notes` heads the list, with New folder and Sort on it,
  // revealed on row hover or focus. The storage folder's name is not shown
  // here at all; it lives in Settings → Storage. New note is the labelled
  // action row above it.

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
  it("keeps New note and the Notes row in one block above the list's scroller, never in it", () => {
    const { getByRole, getByText, container } = renderSidebar();
    const block = getByRole("button", { name: "New note" }).parentElement;
    expect(getByText("Notes").closest("div").parentElement).toBe(block);
    const scroller = container.querySelector(".sidebar-scroll");
    expect(scroller.contains(block)).toBe(false);
    expect(block.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      folderTree: [],
      sortedRootNotes: [],
    });
    expect(getByText("Notes")).toBeInTheDocument();
    expect(getByLabelText("New folder")).toBeInTheDocument();
    // An empty tree fails axe's aria-required-children.
    expect(queryByRole("tree")).not.toBeInTheDocument();
  });

  it("keeps the header while a search narrows the tree to nothing", () => {
    const { getByText } = renderSidebar({ search: "zzz", folderTree: [], sortedRootNotes: [] });
    expect(getByText("Notes")).toBeInTheDocument();
  });

  it("renders one tree named Notes: folders first, then root notes", () => {
    const noteData = buildNoteData([
      { id: "r1", title: "Loose Note" },
      { id: "n1", title: "Nested Note" },
    ]);
    const folderTree = [{ name: "Zed Folder", _path: "Zed Folder", children: [], notes: ["n1"] }];
    const { getAllByRole, getByRole } = renderSidebar({
      noteData,
      folderTree,
      sortedRootNotes: ["r1"],
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
    const { getByText } = renderSidebar({ sortedRootNotes: [] });
    expect(getByText("Notes").closest("[data-drop-root]")).not.toBeNull();
  });

  // ── The Sort menu (2026-09-16) ────────────────────────────────────────────
  // The row's ··· became a Sort glyph whose menu is the two modes alone, each
  // with its glyph and the chosen one marked with a check. Folders stay first
  // and alphabetical; the choice orders notes.

  it("opens the Sort menu with the current mode checked, and flips it", () => {
    const setSortMode = vi.fn();
    const { getByLabelText, getByRole, queryByRole, getAllByRole } = renderSidebar({
      setSortMode,
      sortMode: "recent",
    });
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
    fireEvent.click(getByLabelText("Sort"));
    const menu = getByRole("menu", { name: "Sort notes" });
    expect(menu).toBeInTheDocument();
    // Two radio items and nothing else: no New folder, no Reveal, no heading.
    expect(getAllByRole("menuitemradio")).toHaveLength(2);
    expect(queryByRole("menuitem")).toBeNull();
    const recent = getByRole("menuitemradio", { name: "Most recent" });
    const alpha = getByRole("menuitemradio", { name: "Alphabetical" });
    expect(recent).toHaveAttribute("aria-checked", "true");
    expect(alpha).toHaveAttribute("aria-checked", "false");
    // Each item carries a glyph; only the chosen one carries the check.
    expect(recent.querySelector("svg")).not.toBeNull();
    expect(alpha.querySelector("svg")).not.toBeNull();
    expect(recent.querySelector("[data-testid='sort-check']")).not.toBeNull();
    expect(alpha.querySelector("[data-testid='sort-check']")).toBeNull();
    fireEvent.click(alpha);
    expect(setSortMode).toHaveBeenCalledWith("alpha");
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
  });

  it("marks Alphabetical when it is the mode", () => {
    const { getByLabelText, getByRole } = renderSidebar({ sortMode: "alpha" });
    fireEvent.click(getByLabelText("Sort"));
    expect(getByRole("menuitemradio", { name: "Alphabetical" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      getByRole("menuitemradio", { name: "Alphabetical" }).querySelector(
        "[data-testid='sort-check']",
      ),
    ).not.toBeNull();
  });

  it("walks the Sort menu with the arrows and chooses with Enter, and Escape closes it", () => {
    const setSortMode = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderSidebar({
      setSortMode,
      sortMode: "recent",
    });
    fireEvent.click(getByLabelText("Sort"));
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(setSortMode).toHaveBeenCalledWith("alpha");
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();

    fireEvent.click(getByLabelText("Sort"));
    expect(getByRole("menu", { name: "Sort notes" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("menu", { name: "Sort notes" })).not.toBeInTheDocument();
  });

  // The Notes row's two controls are hidden at rest and revealed on row hover
  // or focus, held while the Sort menu is open (2026-09-16). jsdom can't
  // compute the stylesheet, so assert the DOM hooks: the shared class, inside
  // the header its selectors scope to, keyboard-reachable, and the held-open
  // classes on the row and the Sort control while its menu is up.
  it("keeps both list controls keyboard-reachable and on the one class", () => {
    const { getByLabelText } = renderSidebar();
    for (const name of ["New folder", "Sort"]) {
      const btn = getByLabelText(name);
      expect(btn.tabIndex).toBe(0);
      expect(btn.className).toBe("sidebar-section-action");
      expect(btn.closest(".sidebar-section-header")).not.toBeNull();
    }
  });

  it("holds the row's pair revealed, and Sort lit, while the Sort menu is open", () => {
    const { getByLabelText, queryByRole } = renderSidebar();
    const sort = getByLabelText("Sort");
    const header = sort.closest(".sidebar-section-header");
    expect(header.classList.contains("menu-open")).toBe(false);
    fireEvent.click(sort);
    expect(header.classList.contains("menu-open")).toBe(true);
    expect(sort.classList.contains("is-active")).toBe(true);
    expect(sort).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    expect(header.classList.contains("menu-open")).toBe(false);
    expect(sort.classList.contains("is-active")).toBe(false);
  });

  // A folder row's trailing New note and ··· (2026-09-16). jsdom can't
  // compute the reveal stylesheet, so assert the DOM hooks: both inside the
  // row, on the shared classes, tabIndex -1 (the row stays the keyboard
  // path), and each click reaching its action without toggling the folder.
  it("gives a folder row a trailing New note and ··· that act on that folder", () => {
    const createNote = vi.fn();
    const setCtxMenu = vi.fn();
    const toggle = vi.fn();
    const folderTree = [
      {
        name: "Work",
        _path: "Work",
        notes: [],
        children: [{ name: "Client", _path: "Work/Client", children: [], notes: [] }],
      },
    ];
    const { getAllByLabelText, getByLabelText } = renderSidebar({
      folderTree,
      expanded: { Work: true },
      createNote,
      setCtxMenu,
      toggle,
    });
    // Named for the folder, never the sidebar pill's own "New note".
    const newNotes = [getByLabelText("New note in Work"), getByLabelText("New note in Client")];
    const menus = getAllByLabelText("Folder actions");
    // One pair per folder row, nested rows included.
    expect(newNotes).toHaveLength(2);
    expect(menus).toHaveLength(2);
    for (const el of [...newNotes, ...menus]) {
      expect(el.tagName).toBe("SPAN");
      expect(el.getAttribute("role")).toBe("button");
      expect(el.tabIndex).toBe(-1);
      expect(el.className).toBe("sidebar-folder-action");
      expect(el.closest(".sidebar-folder-actions")).not.toBeNull();
      expect(el.closest(".sidebar-folder")).not.toBeNull();
    }
    fireEvent.click(newNotes[1]);
    expect(createNote).toHaveBeenCalledWith("Work/Client");
    fireEvent.click(menus[0]);
    // The menu is handed the row's rectangle with the gap either side (jsdom
    // rects are 0×0), so it can flip above the row rather than over it.
    expect(setCtxMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "folder",
        id: "Work",
        anchor: { top: -4, bottom: 4, left: -8, right: 0 },
      }),
    );
    expect(toggle).not.toHaveBeenCalled();
  });

  it("holds a folder row's actions open while its menu is up", () => {
    const folderTree = [{ name: "Work", _path: "Work", notes: [], children: [] }];
    const { getByLabelText } = renderSidebar({ folderTree, ctxMenuFolderId: "Work" });
    const slot = getByLabelText("Folder actions").closest(".sidebar-folder-actions");
    expect(slot.style.opacity).toBe("1");
    expect(slot.style.width).toBe("44px");
  });

  it("renders note rows without a file glyph, at any depth", () => {
    const noteData = buildNoteData([
      { id: "r1", title: "Loose Note" },
      { id: "n1", title: "Nested Note" },
    ]);
    const folderTree = [{ name: "My Folder", _path: "My Folder", children: [], notes: ["n1"] }];
    const { getByText } = renderSidebar({
      noteData,
      sortedRootNotes: ["r1"],
      folderTree,
      expanded: { "My Folder": true },
    });
    for (const title of ["Loose Note", "Nested Note"]) {
      const row = getByText(title).closest("[data-note-id]");
      expect(row).not.toBeNull();
      // No document glyph — the row's only svg is the trailing ··· action.
      expect(row.querySelector("svg.lucide-file-text")).toBeNull();
    }
  });

  it("starts a note's title on the glyph column of its depth, like a folder's", () => {
    const noteData = buildNoteData([
      { id: "r1", title: "Loose Note" },
      { id: "n1", title: "Nested Note" },
    ]);
    const folderTree = [{ name: "My Folder", _path: "My Folder", children: [], notes: ["n1"] }];
    const { getByText } = renderSidebar({
      noteData,
      sortedRootNotes: ["r1"],
      folderTree,
      expanded: { "My Folder": true },
    });
    const root = getByText("Loose Note").closest("[data-note-id]");
    const nested = getByText("Nested Note").closest("[data-note-id]");
    const folder = getByText("My Folder").closest('[role="treeitem"]');
    // The pill is inset ROW_INSET from the panel, so the text lands on the
    // sidebar's spine (SPINE plus its own inset; root, flush with the folder
    // glyphs) and one indent in for a folder's note; a note row's padding is
    // exactly the folder row's at its depth.
    const spine = SPINE + SIDEBAR_TREE_INSET;
    expect(root.style.paddingLeft).toBe(`${spine - ROW_INSET}px`);
    expect(root.style.paddingLeft).toBe(folder.style.paddingLeft);
    expect(nested.style.paddingLeft).toBe(`${spine + TREE_INDENT - ROW_INSET}px`);
    // The step is the name's own offset from its glyph, so a folder's note
    // starts exactly under the folder's name.
    expect(TREE_INDENT).toBe(TEXT_COL - SPINE);
  });
});

describe("Sidebar vault menu and files", () => {
  // ── The vault menu and files that are not notes ───────────────────────────
  // The list's name is the vault folder's; it opens the vault menu, which
  // switches vault, says what the tree shows besides notes, and finds another.

  const VAULTS = [
    { path: "/v/University", name: "University", current: true, exists: true, cloud: false },
    { path: "/v/Notes", name: "Notes", current: false, exists: true, cloud: false },
    { path: "/v/Old", name: "Old Journal", current: false, exists: false, cloud: false },
  ];
  const FILES = [
    { path: "reading-list.pdf", attachment: false },
    { path: "attachments/diagram-1.png", attachment: true },
  ];

  it("names the list after the open vault, and says Notes with no vault list (web)", () => {
    const desktop = renderSidebar({ vaults: VAULTS });
    expect(desktop.getByTestId("vault-label")).toHaveTextContent("University");
    cleanup();
    const web = renderSidebar();
    expect(web.queryByTestId("vault-label")).toBeNull();
    expect(web.getByText("Notes")).toBeInTheDocument();
  });

  it("opens the vault menu: the open vault checked, a missing one disabled, another switches", () => {
    const onSwitchVault = vi.fn();
    const { getByTestId, getByRole, queryByRole } = renderSidebar({
      vaults: VAULTS,
      onSwitchVault,
    });
    fireEvent.click(getByTestId("vault-label"));
    expect(getByRole("menu", { name: "Storage location" })).toBeInTheDocument();
    const current = getByRole("menuitemradio", { name: "University" });
    expect(current).toHaveAttribute("aria-checked", "true");
    const missing = getByRole("menuitemradio", { name: /Old Journal/ });
    expect(missing).toHaveAttribute("aria-disabled", "true");
    expect(missing).toHaveTextContent("Not found");
    fireEvent.click(missing);
    expect(onSwitchVault).not.toHaveBeenCalled();
    fireEvent.click(getByRole("menuitemradio", { name: "Notes" }));
    expect(onSwitchVault).toHaveBeenCalledWith("/v/Notes");
    expect(queryByRole("menu", { name: "Storage location" })).toBeNull();
  });

  it("only switches: adding and revealing a location are Settings', through Manage", () => {
    const onManageVaults = vi.fn();
    const view = renderSidebar({ vaults: VAULTS, onManageVaults });
    fireEvent.click(view.getByTestId("vault-label"));
    const menu = view.getByRole("menu", { name: "Storage location" });
    expect(menu).not.toHaveTextContent("Open folder");
    expect(menu).not.toHaveTextContent("Show in Finder");
    fireEvent.click(view.getByRole("menuitem", { name: "Manage storage locations…" }));
    expect(onManageVaults).toHaveBeenCalled();
    expect(view.queryByRole("menu", { name: "Storage location" })).toBeNull();
  });

  it("shows other files by default, opens one on click, and hides them from the vault menu", () => {
    const onOpenFile = vi.fn();
    const view = renderSidebar({ vaults: VAULTS, otherFiles: FILES, onOpenFile });
    const row = view.getByRole("treeitem", { name: "reading-list.pdf" });
    fireEvent.click(row);
    expect(onOpenFile).toHaveBeenCalledWith("reading-list.pdf");
    // The attachment store is hidden until asked for.
    expect(view.queryByTestId("attachments-row")).toBeNull();
    fireEvent.click(view.getByTestId("vault-label"));
    const toggle = view.getByRole("menuitemcheckbox", { name: "Show other files" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(view.queryByRole("treeitem", { name: "reading-list.pdf" })).toBeNull();
    // Remembered for this vault.
    expect(JSON.parse(localStorage.getItem("boojy-vault-view"))["/v/University"]).toEqual({
      otherFiles: false,
      attachments: false,
    });
  });

  it("shows the attachment store as its own row when asked, its files inside", () => {
    const toggle = vi.fn();
    const view = renderSidebar({
      vaults: VAULTS,
      otherFiles: FILES,
      toggle,
      expanded: { attachments: true },
    });
    fireEvent.click(view.getByTestId("vault-label"));
    fireEvent.click(view.getByRole("menuitemcheckbox", { name: "Show attachments" }));
    const store = view.getByTestId("attachments-row");
    expect(store).toHaveAttribute("aria-expanded", "true");
    expect(view.getByRole("treeitem", { name: "diagram-1.png" })).toBeInTheDocument();
    fireEvent.click(store);
    expect(toggle).toHaveBeenCalledWith("attachments");
  });

  it("opens a file's own menu on right-click", () => {
    const setCtxMenu = vi.fn();
    const view = renderSidebar({ vaults: VAULTS, otherFiles: FILES, setCtxMenu });
    fireEvent.contextMenu(view.getByRole("treeitem", { name: "reading-list.pdf" }));
    expect(setCtxMenu).toHaveBeenCalledWith(
      expect.objectContaining({ type: "file", id: "reading-list.pdf" }),
    );
  });
});
