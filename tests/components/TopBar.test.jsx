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

vi.mock("/assets/boojy-notes-text-N.png", () => ({ default: "boojy-N.png" }));
vi.mock("/assets/boojy-notes.text-tes.png", () => ({ default: "boojy-tes.png" }));

// Mutable state object that each factory closure reads from.
// Tests mutate these before rendering to change context values.
const layoutState = {
  chromeBg: "#222",
  accentColor: "#A4CACE",
  sidebarWidth: 220,
  collapsed: false,
  setCollapsed: vi.fn(),
  sidebarHandles: { current: [] },
  isDragging: { current: false },
  startDrag: vi.fn(),
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
  setNoteData: vi.fn(),
  syncGeneration: { current: 0 },
  activeNoteRef: { current: null },
};

const settingsState = {
  settingsFontSize: 15,
  setSettingsFontSize: vi.fn(),
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
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

function renderTopBar(overrides = {}) {
  const props = {
    isMobile: false,
    activeNote: overrides.activeNote ?? "n1",
    setActiveNote: overrides.setActiveNote ?? vi.fn(),
    createNote: overrides.createNote ?? vi.fn(),
    noteTitle: overrides.noteTitle ?? "",
    onMorePress: noop,
    onTitlePress: noop,
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

// The desktop top bar renders nothing at all. The controls it used to hold now
// live elsewhere and are covered there:
//   sidebar toggle + note actions -> tests/components/EditorChrome.test.jsx
//   wordmark / settings entry     -> Sidebar
//   undo/redo                     -> keyboard only (useAppKeyboard)
// Tabs and split view were removed outright with the single-active-note model.
describe("TopBar (desktop, minimal chrome)", () => {
  it("renders no top strip at all", () => {
    const { container } = renderTopBar();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders none of the removed controls", () => {
    const { queryByTitle, queryByText } = renderTopBar();
    expect(queryByTitle("Undo (Ctrl+Z)")).not.toBeInTheDocument();
    expect(queryByTitle("Redo (Ctrl+Shift+Z)")).not.toBeInTheDocument();
    expect(queryByTitle("Quick reference")).not.toBeInTheDocument();
    expect(queryByText(/\d+ words/)).not.toBeInTheDocument();
  });
});
