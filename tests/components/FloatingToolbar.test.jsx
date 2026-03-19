/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// ── Theme mock ──────────────────────────────────────────────────────────────
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
      SEMANTIC: { error: "#ef4444" },
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

// ── Import component after mocks ────────────────────────────────────────────
import FloatingToolbar from "../../src/components/FloatingToolbar.jsx";

// ── Helpers ─────────────────────────────────────────────────────────────────
const defaultFormats = {
  bold: false,
  italic: false,
  strikethrough: false,
  highlight: false,
  code: false,
  link: false,
};

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FloatingToolbar", () => {
  it("renders nothing when position is null", () => {
    const { container } = render(
      <FloatingToolbar position={null} activeFormats={defaultFormats} onFormat={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the toolbar when position is provided", () => {
    const { container } = render(
      <FloatingToolbar
        position={{ top: 50, left: 100 }}
        activeFormats={defaultFormats}
        onFormat={vi.fn()}
      />,
    );
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild.style.position).toBe("absolute");
  });

  it("renders all format buttons", () => {
    const { getByText } = render(
      <FloatingToolbar
        position={{ top: 50, left: 100 }}
        activeFormats={defaultFormats}
        onFormat={vi.fn()}
      />,
    );
    expect(getByText("B")).toBeInTheDocument();
    expect(getByText("I")).toBeInTheDocument();
    expect(getByText("H")).toBeInTheDocument();
    expect(getByText("</>")).toBeInTheDocument();
    expect(getByText("Link")).toBeInTheDocument();
  });

  it("calls onFormat with the correct type when a button is clicked", () => {
    const onFormat = vi.fn();
    const { getByText } = render(
      <FloatingToolbar
        position={{ top: 50, left: 100 }}
        activeFormats={defaultFormats}
        onFormat={onFormat}
      />,
    );
    // FloatingToolbar uses onMouseDown, so use mouseDown event
    fireEvent.mouseDown(getByText("B"));
    expect(onFormat).toHaveBeenCalledWith("bold");
  });

  it("applies active styling when a format is active", () => {
    const activeFormats = { ...defaultFormats, bold: true };
    const { getByText } = render(
      <FloatingToolbar
        position={{ top: 50, left: 100 }}
        activeFormats={activeFormats}
        onFormat={vi.fn()}
      />,
    );
    const boldBtn = getByText("B");
    // Active buttons get the accent color
    expect(boldBtn.style.color).toBe("rgb(164, 202, 206)");
  });
});
