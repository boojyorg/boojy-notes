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
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

vi.mock("../../../src/hooks/useAI", () => ({
  useAI: () => ({
    getMessages: vi.fn(() => []),
    isStreaming: vi.fn(() => false),
    getError: vi.fn(() => null),
    sendMessage: vi.fn(),
    cancelStreaming: vi.fn(),
  }),
}));

const settingsState = {
  aiSettings: {},
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  settingsTab: "profile",
  setSettingsTab: vi.fn(),
  user: null,
};

const layoutState = {
  chromeBg: "#222",
  activeTabBg: "#1C1C20",
  accentColor: "#A4CACE",
};

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => settingsState,
  SettingsProvider: ({ children }) => children,
}));

vi.mock("../../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

vi.mock("../../../src/utils/platform", () => ({
  isElectron: false,
  isCapacitor: false,
  isNative: false,
  isWeb: true,
  platform: "web",
}));

// Stub child components
const mockTabBarProps = { current: null };
vi.mock("../../../src/components/terminal/TerminalTabBar", () => ({
  default: (props) => {
    mockTabBarProps.current = props;
    return (
      <div data-testid="terminal-tab-bar">
        <button data-testid="new-terminal-btn" onClick={props.onNewTerminal}>
          New Terminal
        </button>
        <button data-testid="new-ai-btn" onClick={props.onNewAITab}>
          New AI
        </button>
        {props.terminals.map((t) => (
          <div key={t.id} data-testid={`tab-${t.id}`}>
            <span>{t.title}</span>
            <button data-testid={`close-tab-${t.id}`} onClick={() => props.onCloseTerminal(t.id)}>
              Close
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock("../../../src/components/terminal/TerminalInstance", () => ({
  default: ({ terminalId, isVisible }) => (
    <div data-testid={`terminal-instance-${terminalId}`} data-visible={isVisible}>
      Terminal {terminalId}
    </div>
  ),
}));

vi.mock("../../../src/components/terminal/TerminalSearchBar", () => ({
  default: () => <div data-testid="search-bar" />,
}));

vi.mock("../../../src/components/ai/AIChat", () => ({
  default: () => <div data-testid="ai-chat" />,
}));

// ── Import component after mocks ──────────────────────────────────────────────
import TerminalPanel from "../../../src/components/terminal/TerminalPanel.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  terminals: [],
  activeTerminalId: null,
  setActiveTerminalId: vi.fn(),
  xtermInstances: { current: new Map() },
  createTerminal: vi.fn(),
  createAITab: vi.fn(),
  closeTerminal: vi.fn(),
  renameTerminal: vi.fn(),
  restartTerminal: vi.fn(),
  clearTerminal: vi.fn(),
  markExited: vi.fn(),
  isOpen: true,
  onAIModelChange: vi.fn(),
  onOpenAISettings: vi.fn(),
  noteContext: null,
  sendContext: false,
  onToggleContext: vi.fn(),
};

function renderPanel(overrides = {}) {
  return render(<TerminalPanel {...defaultProps} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("TerminalPanel", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = renderPanel({ isOpen: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the tab bar when isOpen is true", () => {
    renderPanel();
    expect(screen.getByTestId("terminal-tab-bar")).toBeInTheDocument();
  });

  it("shows 'No tabs open' when terminals list is empty", () => {
    renderPanel({ terminals: [] });
    expect(screen.getByText("No tabs open")).toBeInTheDocument();
  });

  it("renders terminal instances for terminal-type tabs", () => {
    const terminals = [
      { id: "t1", title: "zsh", type: "terminal" },
      { id: "t2", title: "bash", type: "terminal" },
    ];
    renderPanel({ terminals, activeTerminalId: "t1" });
    expect(screen.getByTestId("terminal-instance-t1")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-instance-t2")).toBeInTheDocument();
  });

  it("calls createTerminal when new terminal button is clicked", () => {
    const createTerminal = vi.fn();
    renderPanel({ createTerminal });
    fireEvent.click(screen.getByTestId("new-terminal-btn"));
    expect(createTerminal).toHaveBeenCalledTimes(1);
  });

  it("calls closeTerminal with the tab id when close button is clicked", () => {
    const closeTerminal = vi.fn();
    const terminals = [{ id: "t1", title: "zsh", type: "terminal" }];
    renderPanel({ terminals, activeTerminalId: "t1", closeTerminal });
    fireEvent.click(screen.getByTestId("close-tab-t1"));
    expect(closeTerminal).toHaveBeenCalledWith("t1");
  });

  it("passes terminal list to TerminalTabBar", () => {
    const terminals = [
      { id: "t1", title: "zsh", type: "terminal" },
      { id: "t2", title: "AI Chat", type: "ai" },
    ];
    renderPanel({ terminals, activeTerminalId: "t1" });
    expect(screen.getByTestId("tab-t1")).toBeInTheDocument();
    expect(screen.getByTestId("tab-t2")).toBeInTheDocument();
  });

  it("marks the active terminal instance as visible", () => {
    const terminals = [
      { id: "t1", title: "zsh", type: "terminal" },
      { id: "t2", title: "bash", type: "terminal" },
    ];
    renderPanel({ terminals, activeTerminalId: "t1" });
    expect(screen.getByTestId("terminal-instance-t1").dataset.visible).toBe("true");
    expect(screen.getByTestId("terminal-instance-t2").dataset.visible).toBe("false");
  });
});
