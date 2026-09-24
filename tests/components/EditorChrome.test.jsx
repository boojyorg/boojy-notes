/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { surface: "#333", divider: "#444", hover: "#555" },
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
    },
    isDark: true,
  }),
}));

/**
 * The chrome no longer knows *why* the sidebar isn't showing — hidden by the
 * user is the one state it knows. It asks whether the sidebar is visible, and
 * toggles through one action.
 */
const layoutState = {
  sidebarVisible: true,
  sidebarWidth: 260,
  toggleSidebar: vi.fn(),
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

import EditorChrome from "../../src/components/EditorChrome.jsx";

beforeEach(() => {
  layoutState.sidebarVisible = true;
  layoutState.sidebarWidth = 260;
  layoutState.toggleSidebar = vi.fn();
  layoutState.sourceView = false;
});
afterEach(cleanup);

const renderChrome = (props = {}) =>
  render(
    <EditorChrome
      activeNote={props.activeNote === undefined ? "n1" : props.activeNote}
      onNoteActions={props.onNoteActions ?? vi.fn()}
      onNewNote={props.onNewNote ?? vi.fn()}
      onOpenSearch={props.onOpenSearch ?? vi.fn()}
      onToggleSourceView={props.onToggleSourceView ?? vi.fn()}
    />,
  );

describe("EditorChrome", () => {
  // Expanded, the sidebar owns navigation and creation; the header carries the
  // note's ··· and nothing else. Undo and Redo are the menu bar's (2026-09-24).
  it("shows only the note menu while the sidebar is open", () => {
    layoutState.sidebarVisible = true;
    const { container, queryByLabelText, getByLabelText } = renderChrome();
    expect(container.querySelectorAll("button").length).toBe(1);
    expect(getByLabelText("Note actions")).toBeInTheDocument();
    for (const gone of ["Toggle sidebar", "Search notes", "New note", "Undo", "Redo"]) {
      expect(queryByLabelText(gone)).not.toBeInTheDocument();
    }
  });

  it("adds the sidebar, search and new-note controls when the sidebar is not showing", () => {
    layoutState.sidebarVisible = false;
    const { getByLabelText, queryByLabelText } = renderChrome();
    for (const shown of ["Toggle sidebar", "Search notes", "New note"]) {
      expect(getByLabelText(shown)).toBeInTheDocument();
    }
    expect(queryByLabelText("Undo")).not.toBeInTheDocument();
    expect(queryByLabelText("Redo")).not.toBeInTheDocument();
  });

  it("goes through the one toggle action, whatever the sidebar's presentation", () => {
    layoutState.sidebarVisible = false;
    const { getByLabelText } = renderChrome();
    fireEvent.click(getByLabelText("Toggle sidebar"));
    expect(layoutState.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  // Collapsed, Search and New note are the sidebar's own controls in the
  // header: the same actions, never a second, different one.
  it("runs the sidebar's search and new-note actions from the collapsed header", () => {
    layoutState.sidebarVisible = false;
    const onNewNote = vi.fn();
    const onOpenSearch = vi.fn();
    const { getByLabelText } = renderChrome({ onNewNote, onOpenSearch, activeNote: null });
    fireEvent.click(getByLabelText("New note"));
    fireEvent.click(getByLabelText("Search notes"));
    expect(onNewNote).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("opens the menu with viewport coordinates anchored to the button", () => {
    const onNoteActions = vi.fn();
    const { getByLabelText } = renderChrome({ onNoteActions });
    fireEvent.click(getByLabelText("Note actions"));
    expect(onNoteActions).toHaveBeenCalledTimes(1);
    const arg = onNoteActions.mock.calls[0][0];
    expect(arg).toHaveProperty("x");
    expect(arg).toHaveProperty("y");
  });

  // Settings must never need an open note, and the menu is the way to it.
  it("keeps the menu with no active note, named for what it then holds", () => {
    const onNoteActions = vi.fn();
    const { getByLabelText, queryByLabelText } = renderChrome({ activeNote: null, onNoteActions });
    expect(queryByLabelText("Note actions")).not.toBeInTheDocument();
    fireEvent.click(getByLabelText("App options"));
    expect(onNoteActions).toHaveBeenCalledTimes(1);
  });

  // ─── Placement ────────────────────────────────────────────────────
  // With the sidebar away, the left group is pinned to the top-left of the
  // viewport, over the editor rather than over the (zero-width) sidebar column.
  it("pins the left group to the viewport corner when the sidebar is away", () => {
    layoutState.sidebarVisible = false;
    const { container } = renderChrome();
    const group = container.firstChild;
    expect(group.style.position).toBe("fixed");
    expect(group.style.left).toBe("10px");
  });

  // The trio arrives after the panel has gone, never over it.
  it("fades the collapsed trio in after the panel has left", () => {
    layoutState.sidebarVisible = false;
    const { getByLabelText } = renderChrome();
    const trio = getByLabelText("Toggle sidebar").parentElement.parentElement;
    expect(trio.style.animation).toContain("fadeIn");
  });

  // The Markdown view's one mark on screen, and its way back (2026-09-24):
  // a lit `</>` left of the ···, only while the view is on.
  it("shows the lit Markdown control beside the ··· only while the view is on", () => {
    const { queryByTestId, rerender } = renderChrome();
    expect(queryByTestId("source-view-toggle")).not.toBeInTheDocument();
    layoutState.sourceView = true;
    const onToggleSourceView = vi.fn();
    rerender(
      <EditorChrome
        activeNote="n1"
        onNoteActions={vi.fn()}
        onNewNote={vi.fn()}
        onOpenSearch={vi.fn()}
        onToggleSourceView={onToggleSourceView}
      />,
    );
    const toggle = queryByTestId("source-view-toggle");
    expect(toggle).toHaveAttribute("aria-label", "Show formatted");
    // Lit in the accent: the glyph's ink, on a teal wash rather than hover's grey.
    expect(toggle.style.color).toBe("rgb(164, 202, 206)");
    expect(toggle.style.background).toMatch(/rgba\(/);
    expect(toggle.nextElementSibling).toHaveAttribute("aria-label", "Note actions");
    fireEvent.click(toggle);
    expect(onToggleSourceView).toHaveBeenCalledTimes(1);
  });
});
