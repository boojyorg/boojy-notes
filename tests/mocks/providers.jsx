import { vi } from "vitest";
import { render } from "@testing-library/react";

// Lightweight mock context providers for component tests.
// These provide sensible defaults and allow overrides via props.

const defaultNoteData = {};
const defaultActions = {
  setNoteData: vi.fn(),
  syncGeneration: { current: 0 },
  activeNoteRef: { current: null },
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
};

const defaultSettings = {
  settingsFontSize: 15,
  setSettingsFontSize: vi.fn(),
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  settingsTab: "profile",
  setSettingsTab: vi.fn(),
  user: null,
  profile: null,
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  resendVerification: vi.fn(),
  spellCheckEnabled: true,
  setSpellCheckEnabled: vi.fn(),
  spellCheckLanguages: ["en-US"],
  setSpellCheckLanguages: vi.fn(),
  autoUpdateEnabled: true,
  setAutoUpdateEnabled: vi.fn(),
  updateStatus: { state: "idle" },
  setUpdateStatus: vi.fn(),
  aiSettings: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    baseUrl: "",
    maxTokens: 4096,
    sendContext: true,
    apiKey: "",
  },
  setAISettings: vi.fn(),
  updateAISetting: vi.fn(),
  saveAIKey: vi.fn(),
};

const defaultLayout = {
  collapsed: false,
  setCollapsed: vi.fn(),
  rightPanel: false,
  setRightPanel: vi.fn(),
  sidebarWidth: 220,
  setSidebarWidth: vi.fn(),
  rightPanelWidth: 220,
  setRightPanelWidth: vi.fn(),
  chromeBg: "#222",
  setChromeBg: vi.fn(),
  editorBg: "#1a1a1e",
  setEditorBg: vi.fn(),
  accentColor: "#A4CACE",
  setAccentColor: vi.fn(),
  activeTabBg: "#1C1C20",
  setActiveTabBg: vi.fn(),
  tabFlip: false,
  setTabFlip: vi.fn(),
  selectionStyle: "B",
  setSelectionStyle: vi.fn(),
  topBarEdge: "B",
  setTopBarEdge: vi.fn(),
  createBtnStyle: "A",
  setCreateBtnStyle: vi.fn(),
  sidebarHandles: { current: [] },
  rightPanelHandles: { current: [] },
  isDragging: { current: false },
  startDrag: vi.fn(),
  startRightDrag: vi.fn(),
};

/**
 * Mock context modules for tests.
 * Call this at module scope (before imports that use contexts).
 */
export function mockContexts(overrides = {}) {
  const noteDataValue = { noteData: overrides.noteData ?? defaultNoteData };
  const actionsValue = { ...defaultActions, ...overrides.actions };
  const settingsValue = { ...defaultSettings, ...overrides.settings };
  const layoutValue = { ...defaultLayout, ...overrides.layout };

  vi.mock("../../src/context/NoteDataContext", () => ({
    useNoteData: () => noteDataValue,
    useNoteDataActions: () => actionsValue,
    NoteDataProvider: ({ children }) => children,
  }));

  vi.mock("../../src/context/SettingsContext", () => ({
    useSettings: () => settingsValue,
    SettingsProvider: ({ children }) => children,
  }));

  vi.mock("../../src/context/LayoutContext", () => ({
    useLayout: () => layoutValue,
    LayoutProvider: ({ children }) => children,
  }));

  return { noteDataValue, actionsValue, settingsValue, layoutValue };
}

/**
 * Render helper that wraps UI in minimal providers.
 * Use mockContexts() before calling this.
 */
export function renderWithProviders(ui, options = {}) {
  return render(ui, options);
}
