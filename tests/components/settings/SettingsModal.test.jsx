/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ── Static mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../../../src/hooks/useTheme", () => ({
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
      modalBg: "#1a1a1e",
      modalShadow: "0 0 20px rgba(0,0,0,0.5)",
      overlay: (opacity) => `rgba(255,255,255,${opacity})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

vi.mock("../../../src/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

// Mutable settings state so tests can toggle settingsOpen / settingsTab
const settingsState = {
  settingsOpen: true,
  setSettingsOpen: vi.fn(),
  settingsTab: "profile",
  setSettingsTab: vi.fn(),
  user: null,
  profile: null,
  aiSettings: {},
};

const layoutState = {
  accentColor: "#A4CACE",
  chromeBg: "#222",
  activeTabBg: "#1C1C20",
};

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => settingsState,
  SettingsProvider: ({ children }) => children,
}));

vi.mock("../../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

// Stub child tab components so we only test the modal shell
vi.mock("../../../src/components/settings/ProfileTab", () => ({
  default: () => <div data-testid="profile-tab">Profile</div>,
}));
vi.mock("../../../src/components/settings/AppearanceTab", () => ({
  default: () => <div data-testid="appearance-tab">Appearance</div>,
}));
vi.mock("../../../src/components/settings/EditorTab", () => ({
  default: () => <div data-testid="editor-tab">Editor</div>,
}));
vi.mock("../../../src/components/settings/AITab", () => ({
  default: () => <div data-testid="ai-tab">AI</div>,
}));
vi.mock("../../../src/components/settings/ExportTab", () => ({
  default: () => <div data-testid="export-tab">Export</div>,
}));
vi.mock("../../../src/components/settings/AboutTab", () => ({
  BrandingFooter: () => <div data-testid="branding-footer" />,
  ContentFooter: () => <div data-testid="content-footer" />,
}));

// ── Import component after mocks ──────────────────────────────────────────────
import SettingsModal from "../../../src/components/settings/SettingsModal.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  isMobile: false,
  syncState: "synced",
  lastSynced: null,
  storageUsed: 0,
  storageLimitMB: 100,
  onSync: vi.fn(),
  noteData: {},
  setActiveNote: vi.fn(),
  isDesktop: true,
  notesDir: "/notes",
  changeNotesDir: vi.fn(),
  onAIKeyTest: vi.fn(),
};

function renderModal(overrides = {}) {
  return render(<SettingsModal {...defaultProps} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // jsdom doesn't implement Element.scrollTo — stub it to avoid unhandled errors
  Element.prototype.scrollTo = vi.fn();

  settingsState.settingsOpen = true;
  settingsState.setSettingsOpen = vi.fn();
  settingsState.settingsTab = "profile";
  settingsState.setSettingsTab = vi.fn();
  settingsState.user = null;
});

afterEach(() => {
  cleanup();
});

describe("SettingsModal", () => {
  it("renders the dialog when settingsOpen is true", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("does not render when settingsOpen is false", () => {
    settingsState.settingsOpen = false;
    const { container } = renderModal();
    expect(container.innerHTML).toBe("");
  });

  it("has proper ARIA attributes on the dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Settings");
  });

  it("renders sidebar navigation buttons on desktop", () => {
    renderModal();
    // Sidebar buttons contain text that may also appear in child stubs,
    // so query all and check at least two matches (sidebar + stub).
    const profileMatches = screen.getAllByText("Profile");
    expect(profileMatches.length).toBeGreaterThanOrEqual(2); // sidebar button + stub
    // Appearance only appears once in stub and once in sidebar
    const appearanceMatches = screen.getAllByText("Appearance");
    expect(appearanceMatches.length).toBeGreaterThanOrEqual(2);
    // Storage sidebar item is desktop-only and not duplicated in stubs
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
  });

  it("clicking a sidebar item calls setSettingsTab", () => {
    renderModal();
    // Use Storage button — unique to sidebar (no child stub named "Storage")
    const storageBtn = screen.getByText("Storage");
    fireEvent.click(storageBtn);
    expect(settingsState.setSettingsTab).toHaveBeenCalledWith("storage");
  });

  it("renders the close button on desktop and calls setSettingsOpen(false)", () => {
    renderModal();
    // The close button renders the unicode cross character
    const closeBtn = screen.getByText("\u2715");
    fireEvent.click(closeBtn);
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("renders back arrow instead of close button on mobile", () => {
    renderModal({ isMobile: true });
    const backBtn = screen.getByLabelText("Back");
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("renders child tab content sections", () => {
    renderModal();
    expect(screen.getByTestId("profile-tab")).toBeInTheDocument();
    expect(screen.getByTestId("appearance-tab")).toBeInTheDocument();
    expect(screen.getByTestId("editor-tab")).toBeInTheDocument();
    expect(screen.getByTestId("ai-tab")).toBeInTheDocument();
  });
});
