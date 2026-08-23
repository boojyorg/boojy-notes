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

/**
 * The chrome no longer knows *why* the sidebar isn't showing — hidden by the
 * user or a closed overlay at a narrow width are the same thing to it. It asks
 * whether the sidebar is visible, and toggles through one action.
 */
const layoutState = {
  sidebarVisible: true,
  toggleSidebar: vi.fn(),
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

import EditorChrome from "../../src/components/EditorChrome.jsx";

beforeEach(() => {
  layoutState.sidebarVisible = true;
  layoutState.toggleSidebar = vi.fn();
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
    layoutState.sidebarVisible = true;
    const { container, queryByTitle } = renderChrome();
    expect(container.querySelectorAll("button").length).toBe(1);
    expect(queryByTitle("Hide sidebar")).not.toBeInTheDocument();
  });

  it("shows the expand affordance when the sidebar is not showing", () => {
    layoutState.sidebarVisible = false;
    const { getByTitle } = renderChrome();
    expect(getByTitle("Show sidebar")).toBeInTheDocument();
  });

  it("goes through the one toggle action, whatever the sidebar's presentation", () => {
    layoutState.sidebarVisible = false;
    const { getByTitle } = renderChrome();
    fireEvent.click(getByTitle("Show sidebar"));
    expect(layoutState.toggleSidebar).toHaveBeenCalledTimes(1);
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

  it("hides note actions when no note is open, keeping the toggle", () => {
    layoutState.sidebarVisible = false;
    const { queryByTitle, getByTitle } = renderChrome({ activeNote: null });
    expect(queryByTitle("Note actions")).not.toBeInTheDocument();
    expect(getByTitle("Show sidebar")).toBeInTheDocument();
  });

  // With the sidebar away, the toggle is pinned to the top-left of the viewport
  // so it sits over the editor rather than over the (zero-width) sidebar column.
  // The same pinned button serves a closed overlay at narrow widths.
  it("pins the toggle to the top-left of the viewport", () => {
    layoutState.sidebarVisible = false;
    const { container } = renderChrome();
    expect(container.firstChild.style.position).toBe("fixed");
    expect(container.firstChild.style.left).toBe("10px");
  });

  it("stands down whenever the sidebar is showing, overlay included", () => {
    // An open overlay is `sidebarVisible`, so the pinned button is not rendered
    // and the sidebar header's own toggle is the one on screen.
    layoutState.sidebarVisible = true;
    const { queryByTitle } = renderChrome();
    expect(queryByTitle("Show sidebar")).not.toBeInTheDocument();
    expect(queryByTitle("Hide sidebar")).not.toBeInTheDocument();
  });
});
