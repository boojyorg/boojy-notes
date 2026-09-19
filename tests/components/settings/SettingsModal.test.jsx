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
  uiScale: 100,
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
  settingsState.uiScale = 100;
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

  // The pane keeps the size and place it opened with while the app resizes
  // behind it: a panel that grows as you press the button inside it moves that
  // button out from under the pointer (judged live, Tyr, 2026-09-19). It is not
  // excluded from the scale — the next time it opens it is drawn at whatever
  // the scale is then.
  describe("its own scale", () => {
    const pane = () => screen.getByRole("dialog");

    it("carries no zoom of its own at the scale it opened with", () => {
      renderModal();
      expect(pane().style.zoom).toBe("");
      expect(pane().style.getPropertyValue("--ui-scale")).toBe("1");
    });

    it("cancels the difference when the scale changes while it is open", () => {
      const { rerender } = renderModal();
      settingsState.uiScale = 200;
      rerender(<SettingsModal {...defaultProps} />);
      // 100 / 200: the pane is drawn at the size it opened with.
      expect(pane().style.zoom).toBe("0.5");
      expect(pane().style.getPropertyValue("--ui-scale")).toBe("1");

      settingsState.uiScale = 50;
      rerender(<SettingsModal {...defaultProps} />);
      expect(pane().style.zoom).toBe("2");
    });

    it("opens at the scale of the day, so reopening picks up the new one", () => {
      const { rerender } = renderModal();
      settingsState.uiScale = 150;
      rerender(<SettingsModal {...defaultProps} />);
      expect(Number(pane().style.zoom)).toBeCloseTo(100 / 150, 5);

      // Closed, then opened again at 150.
      settingsState.settingsOpen = false;
      rerender(<SettingsModal {...defaultProps} />);
      settingsState.settingsOpen = true;
      rerender(<SettingsModal {...defaultProps} />);
      expect(pane().style.zoom).toBe("");
      expect(pane().style.getPropertyValue("--ui-scale")).toBe("1.5");
    });

    // The shell's scale shortcuts are the one thing allowed to act over
    // Settings, and they find the pane by this attribute (`useAppKeyboard`).
    it("names itself so the scale shortcuts can tell it from any other modal", () => {
      renderModal();
      expect(pane()).toHaveAttribute("data-settings-pane");
    });
  });
});
