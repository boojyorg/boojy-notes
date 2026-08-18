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

// Mutable settings state so tests can toggle settingsOpen
const settingsState = {
  settingsOpen: true,
  setSettingsOpen: vi.fn(),
  user: null,
  profile: null,
};

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => settingsState,
  SettingsProvider: ({ children }) => children,
}));

// Stub child tab components so we only test the modal shell
vi.mock("../../../src/components/settings/AppearanceTab", () => ({
  default: () => <div data-testid="appearance-tab">Appearance</div>,
}));
vi.mock("../../../src/components/settings/UpdatesTab", () => ({
  default: ({ isDesktop }) => (isDesktop ? <div data-testid="updates-tab">Updates</div> : null),
}));
vi.mock("../../../src/components/settings/ExportTab", () => ({
  default: ({ isDesktop }) => (isDesktop ? <div data-testid="export-tab">Export</div> : null),
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
  isDesktop: true,
  notesDir: "/notes",
  changeNotesDir: vi.fn(),
};

function renderModal(overrides = {}) {
  return render(<SettingsModal {...defaultProps} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  settingsState.settingsOpen = true;
  settingsState.setSettingsOpen = vi.fn();
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

  it("is a single pane: no navigation sidebar and no Profile section", () => {
    renderModal();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    // The nav items used to be buttons named after sections; the section content
    // stubs are the only match now.
    expect(screen.getAllByTestId(/appearance-tab/).length).toBe(1);
    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();
  });

  it("renders Appearance, Storage and Updates content plus the About footer on desktop", () => {
    renderModal();
    expect(screen.getByTestId("appearance-tab")).toBeInTheDocument();
    expect(screen.getByTestId("export-tab")).toBeInTheDocument();
    expect(screen.getByTestId("updates-tab")).toBeInTheDocument();
    expect(screen.getByTestId("content-footer")).toBeInTheDocument();
    // The big branding block is desktop-gone.
    expect(screen.queryByTestId("branding-footer")).not.toBeInTheDocument();
  });

  it("hides the desktop-only sections on web", () => {
    renderModal({ isDesktop: false });
    expect(screen.getByTestId("appearance-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("export-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("updates-tab")).not.toBeInTheDocument();
  });

  it("renders the close button on desktop and calls setSettingsOpen(false)", () => {
    renderModal();
    // The close button renders the unicode cross character
    const closeBtn = screen.getByText("✕");
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

  it("keeps the branding footer on the mobile layout", () => {
    renderModal({ isMobile: true });
    expect(screen.getByTestId("branding-footer")).toBeInTheDocument();
  });
});
