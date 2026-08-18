/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// ── Static mocks (hoisted) ────────────────────────────────────────────────────
// These must be declared before any component imports.

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
      SEMANTIC: {},
      link: { color: "#7AA2F7", underline: "#7AA2F744", hoverBg: "#7AA2F710" },
      searchInputBg: "#222",
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

vi.mock("../../src/components/HelpDropdown", () => ({
  default: () => null,
}));

vi.mock("/assets/boojy-notes-text-N.png", () => ({ default: "boojy-N.png" }));
vi.mock("/assets/boojy-notes.text-tes.png", () => ({ default: "boojy-tes.png" }));

// Mutable state object that each factory closure reads from.
// Tests mutate these before rendering to change context values.
const layoutState = {
  chromeBg: "#222",
  accentColor: "#A4CACE",
  topBarEdge: "B",
  tabFlip: false,
  activeTabBg: "#1C1C20",
  sidebarWidth: 220,
  rightPanelWidth: 220,
  collapsed: false,
  setCollapsed: vi.fn(),
  rightPanel: false,
  setRightPanel: vi.fn(),
  sidebarHandles: { current: [] },
  rightPanelHandles: { current: [] },
  isDragging: { current: false },
  startDrag: vi.fn(),
  startRightDrag: vi.fn(),
};

const actionsState = {
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  commitNoteData: vi.fn(),
  commitTextChange: vi.fn(),
  pushHistory: vi.fn(),
  popHistory: vi.fn(),
  isUndoRedo: { current: false },
  noteDataRef: { current: {} },
  textOnlyEdit: { current: false },
  textOnlyEditForSidebar: { current: false },
  editedNoteHint: { current: null },
  setNoteData: vi.fn(),
  syncGeneration: { current: 0 },
  activeNoteRef: { current: null },
};

const settingsState = {
  settingsFontSize: 15,
  setSettingsFontSize: vi.fn(),
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  settingsTab: "profile",
  setSettingsTab: vi.fn(),
  user: null,
  profile: null,
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteData: () => ({ noteData: {} }),
  useNoteDataActions: () => actionsState,
  NoteDataProvider: ({ children }) => children,
}));

vi.mock("../../src/context/SettingsContext", () => ({
  useSettings: () => settingsState,
  SettingsProvider: ({ children }) => children,
}));

// ── Import component after mocks ──────────────────────────────────────────────
import TopBar from "../../src/components/TopBar.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const noop = () => {};

function buildNoteData(ids) {
  return Object.fromEntries(ids.map((id) => [id, { title: `Note ${id}`, blocks: [] }]));
}

function renderTopBar(overrides = {}) {
  const tabs = overrides.tabs ?? ["n1", "n2"];
  const noteData = overrides.noteData ?? buildNoteData(tabs);

  const props = {
    tabs,
    activeNote: overrides.activeNote ?? "n1",
    noteData,
    newTabId: null,
    closingTabs: new Set(),
    setActiveNote: overrides.setActiveNote ?? vi.fn(),
    closeTab: overrides.closeTab ?? vi.fn(),
    syncState: overrides.syncState ?? "synced",
    syncDotStyle: overrides.syncDotStyle ?? (() => ({})),
    note: overrides.note ?? null,
    wordCount: overrides.wordCount ?? 0,
    charCount: 0,
    charCountNoSpaces: 0,
    readingTime: 0,
    tabScrollRef: { current: null },
    tabAreaWidth: 600,
    splitMode: null,
    panes: null,
    activePaneId: null,
    dividerPosition: 50,
    setActiveNoteForPane: noop,
    setActivePaneId: noop,
    setTabsForPane: noop,
    closePaneIfEmpty: noop,
    isMobile: false,
    createNote: overrides.createNote ?? vi.fn(),
    noteTitle: overrides.noteTitle ?? "",
    onTabPointerDown: null,
  };

  return render(<TopBar {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset mutable state to defaults before each test.
  actionsState.canUndo = false;
  actionsState.canRedo = false;
  actionsState.undo = vi.fn();
  actionsState.redo = vi.fn();
  layoutState.collapsed = false;
  layoutState.setCollapsed = vi.fn();
});

afterEach(() => {
  cleanup();
});

// Minimal-chrome experiment: the desktop top bar renders nothing at all. The
// controls it used to hold now live elsewhere and are covered there:
//   sidebar toggle + note actions -> tests/components/EditorChrome.test.jsx
//   wordmark / settings entry     -> Sidebar
//   undo/redo                     -> keyboard only (useAppKeyboard)
// Tab/pane STATE is untouched; only PaneTabBar is unmounted.
describe("TopBar (desktop, minimal chrome)", () => {
  it("renders no top strip at all", () => {
    const { container } = renderTopBar();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders no visible tab elements even when tabs are open", () => {
    const tabs = ["n1", "n2"];
    const { container } = renderTopBar({ tabs, noteData: buildNoteData(tabs) });
    expect(container.querySelectorAll("[data-tab-id]").length).toBe(0);
    expect(container.querySelectorAll("[data-pane-tab-bar]").length).toBe(0);
  });

  it("renders none of the removed controls", () => {
    const { queryByTitle, queryByText } = renderTopBar();
    expect(queryByTitle("Undo (Ctrl+Z)")).not.toBeInTheDocument();
    expect(queryByTitle("Redo (Ctrl+Shift+Z)")).not.toBeInTheDocument();
    expect(queryByTitle("Quick reference")).not.toBeInTheDocument();
    expect(queryByText(/\d+ words/)).not.toBeInTheDocument();
  });
});
