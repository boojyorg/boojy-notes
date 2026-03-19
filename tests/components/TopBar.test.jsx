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

describe("TopBar", () => {
  it("renders tab elements for provided tabs", () => {
    const tabs = ["n1", "n2"];
    const noteData = buildNoteData(tabs);
    const { container } = renderTopBar({ tabs, noteData });

    const tabButtons = container.querySelectorAll("[data-tab-id]");
    expect(tabButtons.length).toBe(2);
    expect(container.querySelector('[data-tab-id="n1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tab-id="n2"]')).toBeInTheDocument();
  });

  it("undo button has reduced opacity when canUndo=false", () => {
    actionsState.canUndo = false;
    const { getByTitle } = renderTopBar();
    expect(getByTitle("Undo (Ctrl+Z)").style.opacity).toBe("0.3");
  });

  it("redo button has reduced opacity when canRedo=false", () => {
    actionsState.canRedo = false;
    const { getByTitle } = renderTopBar();
    expect(getByTitle("Redo (Ctrl+Shift+Z)").style.opacity).toBe("0.3");
  });

  it("undo button is at full opacity when canUndo=true", () => {
    actionsState.canUndo = true;
    const { getByTitle } = renderTopBar();
    expect(getByTitle("Undo (Ctrl+Z)").style.opacity).toBe("1");
  });

  it("calls undo when undo button is clicked", () => {
    actionsState.canUndo = true;
    const { getByTitle } = renderTopBar();
    fireEvent.click(getByTitle("Undo (Ctrl+Z)"));
    expect(actionsState.undo).toHaveBeenCalledTimes(1);
  });

  it("calls redo when redo button is clicked", () => {
    actionsState.canRedo = true;
    const { getByTitle } = renderTopBar();
    fireEvent.click(getByTitle("Redo (Ctrl+Shift+Z)"));
    expect(actionsState.redo).toHaveBeenCalledTimes(1);
  });

  it("renders the sidebar toggle button", () => {
    layoutState.collapsed = false;
    const { getByTitle } = renderTopBar();
    expect(getByTitle("Hide sidebar")).toBeInTheDocument();
  });

  it("renders the sync dot indicator button with syncState in title", () => {
    const { getByTitle } = renderTopBar({ syncState: "offline" });
    expect(getByTitle("Settings \u00b7 Sync: offline")).toBeInTheDocument();
  });
});
