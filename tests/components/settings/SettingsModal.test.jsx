/** @vitest-environment jsdom */
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
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF", onAccentText: "#111" },
      button: { bg: "transparent", border: "#444" },
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
vi.mock("../../../src/components/settings/StorageTab", () => ({
  default: ({ isDesktop, revealNotesDir }) =>
    isDesktop ? (
      <div data-testid="storage-tab" data-reveal={revealNotesDir ? "yes" : "no"}>
        Storage
      </div>
    ) : null,
}));
vi.mock("../../../src/components/settings/SettingsFooter", () => ({
  default: () => <div data-testid="settings-footer" />,
}));

// ── Import component after mocks ──────────────────────────────────────────────
import SettingsModal from "../../../src/components/settings/SettingsModal.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  isMobile: false,
  isDesktop: true,
  notesDir: "/notes",
  changeNotesDir: vi.fn(),
  revealNotesDir: vi.fn(),
};

function renderModal(overrides = {}) {
  return render(<SettingsModal {...defaultProps} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  settingsState.settingsOpen = true;
  settingsState.setSettingsOpen = vi.fn();
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

  it("gives the desktop close button an accessible name", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
  });

  it("is a single pane: no navigation sidebar and no Profile section", () => {
    renderModal();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    // The nav items used to be buttons named after sections; the section content
    // stubs are the only match now.
    expect(screen.getAllByTestId(/appearance-tab/).length).toBe(1);
    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();
  });

  it("renders Appearance, Storage and Updates content plus the quiet footer on desktop", () => {
    renderModal();
    expect(screen.getByTestId("appearance-tab")).toBeInTheDocument();
    expect(screen.getByTestId("storage-tab")).toBeInTheDocument();
    // Show in Finder reaches the Storage section through the modal.
    expect(screen.getByTestId("storage-tab").dataset.reveal).toBe("yes");
    expect(screen.getByTestId("updates-tab")).toBeInTheDocument();
    expect(screen.getByTestId("settings-footer")).toBeInTheDocument();
  });

  it("hides the desktop-only sections on web", () => {
    renderModal({ isDesktop: false });
    expect(screen.getByTestId("appearance-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("storage-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("updates-tab")).not.toBeInTheDocument();
  });

  it("renders the close button on desktop and calls setSettingsOpen(false)", () => {
    renderModal();
    // A chrome button with a Lucide X, named for the reader; no ✕ typed as text.
    const closeBtn = screen.getByRole("button", { name: "Close settings" });
    expect(closeBtn.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("✕")).toBeNull();
    fireEvent.click(closeBtn);
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("carries the Settings cog beside its title and no section rule in the accent", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll('[role="separator"]').length).toBe(2);
    expect(dialog.querySelector("svg.lucide-settings")).not.toBeNull();
  });

  it("renders back arrow instead of close button on mobile", () => {
    renderModal({ isMobile: true });
    const backBtn = screen.getByLabelText("Back");
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(settingsState.setSettingsOpen).toHaveBeenCalledWith(false);
  });

  it("uses the same quiet footer on the mobile layout", () => {
    renderModal({ isMobile: true });
    expect(screen.getByTestId("settings-footer")).toBeInTheDocument();
    expect(screen.queryByText("About Boojy Notes")).not.toBeInTheDocument();
  });
});
