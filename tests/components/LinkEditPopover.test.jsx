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
import LinkEditPopover from "../../src/components/LinkEditPopover.jsx";

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LinkEditPopover", () => {
  it("renders nothing when position is null", () => {
    const { container } = render(
      <LinkEditPopover
        position={null}
        initialUrl=""
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders with an input pre-filled with the initial URL", () => {
    const { getByPlaceholderText } = render(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl="https://example.com"
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const input = getByPlaceholderText("https://...");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("https://example.com");
  });

  it("calls onApply with trimmed URL when Apply is clicked", () => {
    const onApply = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl=""
        onApply={onApply}
        onRemove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const input = getByPlaceholderText("https://...");
    fireEvent.change(input, { target: { value: "  https://new-link.com  " } });
    fireEvent.click(getByText("Apply"));
    expect(onApply).toHaveBeenCalledWith("https://new-link.com");
  });

  it("shows Remove button only when initialUrl is provided", () => {
    const { queryByText, rerender } = render(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl=""
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(queryByText("Remove")).not.toBeInTheDocument();

    rerender(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl="https://example.com"
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(queryByText("Remove")).toBeInTheDocument();
  });

  it("calls onRemove when Remove button is clicked", () => {
    const onRemove = vi.fn();
    const { getByText } = render(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl="https://example.com"
        onApply={vi.fn()}
        onRemove={onRemove}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(getByText("Remove"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("calls onDismiss when Escape key is pressed", () => {
    const onDismiss = vi.fn();
    render(
      <LinkEditPopover
        position={{ top: 50, left: 100 }}
        initialUrl=""
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });
});
