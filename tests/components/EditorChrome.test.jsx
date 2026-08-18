/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { surface: "#333", divider: "#444", hover: "#555" },
      ACCENT: { primary: "#A4CACE" },
    },
    isDark: true,
  }),
}));

const layoutState = {
  collapsed: false,
  setCollapsed: vi.fn(),
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

import EditorChrome from "../../src/components/EditorChrome.jsx";

beforeEach(() => {
  layoutState.collapsed = false;
  layoutState.setCollapsed = vi.fn();
});
afterEach(cleanup);

const renderChrome = (props = {}) =>
  render(
    <EditorChrome
      topOffset={28}
      activeNote={props.activeNote === undefined ? "n1" : props.activeNote}
      onNoteActions={props.onNoteActions ?? vi.fn()}
    />,
  );

describe("EditorChrome", () => {
  it("renders only note actions while the sidebar is open — the toggle lives in the sidebar header", () => {
    layoutState.collapsed = false;
    const { container, queryByTitle } = renderChrome();
    expect(container.querySelectorAll("button").length).toBe(1);
    expect(queryByTitle("Hide sidebar")).not.toBeInTheDocument();
  });

  it("shows the expand affordance when the sidebar is collapsed", () => {
    layoutState.collapsed = true;
    const { getByTitle } = renderChrome();
    expect(getByTitle("Show sidebar")).toBeInTheDocument();
  });

  it("expands the sidebar when the pinned toggle is clicked", () => {
    layoutState.collapsed = true;
    const { getByTitle } = renderChrome();
    fireEvent.click(getByTitle("Show sidebar"));
    expect(layoutState.setCollapsed).toHaveBeenCalledWith(false);
  });

  it("opens note actions with viewport coordinates anchored to the button", () => {
    const onNoteActions = vi.fn();
    const { getByTitle } = renderChrome({ onNoteActions });
    fireEvent.click(getByTitle("Note actions"));
    expect(onNoteActions).toHaveBeenCalledTimes(1);
    const arg = onNoteActions.mock.calls[0][0];
    expect(arg).toHaveProperty("x");
    expect(arg).toHaveProperty("y");
  });

  it("hides note actions when no note is open, keeping the collapsed-state toggle", () => {
    layoutState.collapsed = true;
    const { queryByTitle, getByTitle } = renderChrome({ activeNote: null });
    expect(queryByTitle("Note actions")).not.toBeInTheDocument();
    expect(getByTitle("Show sidebar")).toBeInTheDocument();
  });

  // Collapsed, the toggle is pinned to the top-left of the viewport so it sits
  // over the editor rather than over the (zero-width) sidebar column.
  it("pins the collapsed-state toggle to the top-left of the viewport", () => {
    layoutState.collapsed = true;
    const { container } = renderChrome();
    expect(container.firstChild.style.position).toBe("fixed");
    expect(container.firstChild.style.left).toBe("10px");
  });
});
