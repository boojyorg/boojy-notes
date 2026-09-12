/** @vitest-environment jsdom */
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
  sidebarInFlow: true,
  sidebarWidth: 260,
  toggleSidebar: vi.fn(),
};

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => layoutState,
  LayoutProvider: ({ children }) => children,
}));

/** Undo and redo are the open note's; the chrome only reports and calls them. */
const historyState = {
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
};

vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteDataActions: () => historyState,
}));

import EditorChrome from "../../src/components/EditorChrome.jsx";

beforeEach(() => {
  layoutState.sidebarVisible = true;
  layoutState.sidebarInFlow = true;
  layoutState.sidebarWidth = 260;
  layoutState.toggleSidebar = vi.fn();
  historyState.canUndo = false;
  historyState.canRedo = false;
  historyState.undo = vi.fn();
  historyState.redo = vi.fn();
});
afterEach(cleanup);

const renderChrome = (props = {}) =>
  render(
    <EditorChrome
      activeNote={props.activeNote === undefined ? "n1" : props.activeNote}
      onNoteActions={props.onNoteActions ?? vi.fn()}
      onNewNote={props.onNewNote ?? vi.fn()}
      onOpenSearch={props.onOpenSearch ?? vi.fn()}
    />,
  );

describe("EditorChrome", () => {
  // Expanded, the sidebar owns navigation and creation; the header carries the
  // open note's history and its ··· and nothing else.
  it("shows only history and the note menu while the sidebar is open", () => {
    layoutState.sidebarVisible = true;
    const { container, queryByTitle, getByTitle } = renderChrome();
    expect(container.querySelectorAll("button").length).toBe(3);
    expect(getByTitle("Undo")).toBeInTheDocument();
    expect(getByTitle("Redo")).toBeInTheDocument();
    expect(getByTitle("Note actions")).toBeInTheDocument();
    for (const gone of ["Hide sidebar", "Show sidebar", "Search notes", "New note"]) {
      expect(queryByTitle(gone)).not.toBeInTheDocument();
    }
  });

  it("adds the sidebar, search and new-note controls when the sidebar is not showing", () => {
    layoutState.sidebarVisible = false;
    const { getByTitle } = renderChrome();
    for (const shown of ["Show sidebar", "Search notes", "New note", "Undo", "Redo"]) {
      expect(getByTitle(shown)).toBeInTheDocument();
    }
  });

  it("goes through the one toggle action, whatever the sidebar's presentation", () => {
    layoutState.sidebarVisible = false;
    const { getByTitle } = renderChrome();
    fireEvent.click(getByTitle("Show sidebar"));
    expect(layoutState.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  // Collapsed, Search and New note are the sidebar's own controls in the
  // header: the same actions, never a second, different one.
  it("runs the sidebar's search and new-note actions from the collapsed header", () => {
    layoutState.sidebarVisible = false;
    const onNewNote = vi.fn();
    const onOpenSearch = vi.fn();
    const { getByTitle } = renderChrome({ onNewNote, onOpenSearch, activeNote: null });
    fireEvent.click(getByTitle("New note"));
    fireEvent.click(getByTitle("Search notes"));
    expect(onNewNote).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("opens the menu with viewport coordinates anchored to the button", () => {
    const onNoteActions = vi.fn();
    const { getByTitle } = renderChrome({ onNoteActions });
    fireEvent.click(getByTitle("Note actions"));
    expect(onNoteActions).toHaveBeenCalledTimes(1);
    const arg = onNoteActions.mock.calls[0][0];
    expect(arg).toHaveProperty("x");
    expect(arg).toHaveProperty("y");
  });

  // Settings must never need an open note, and the menu is the way to it.
  it("keeps the menu with no active note, named for what it then holds", () => {
    const onNoteActions = vi.fn();
    const { getByTitle, queryByTitle } = renderChrome({ activeNote: null, onNoteActions });
    expect(queryByTitle("Note actions")).not.toBeInTheDocument();
    fireEvent.click(getByTitle("App options"));
    expect(onNoteActions).toHaveBeenCalledTimes(1);
  });

  // ─── History ──────────────────────────────────────────────────────
  it("disables undo and redo until the open note has something to take back", () => {
    const { getByTitle } = renderChrome();
    expect(getByTitle("Undo")).toBeDisabled();
    expect(getByTitle("Redo")).toBeDisabled();
    fireEvent.click(getByTitle("Undo"));
    expect(historyState.undo).not.toHaveBeenCalled();
  });

  it("calls the history actions when the open note has them", () => {
    historyState.canUndo = true;
    historyState.canRedo = true;
    const { getByTitle } = renderChrome();
    expect(getByTitle("Undo")).not.toBeDisabled();
    fireEvent.click(getByTitle("Undo"));
    fireEvent.click(getByTitle("Redo"));
    expect(historyState.undo).toHaveBeenCalledTimes(1);
    expect(historyState.redo).toHaveBeenCalledTimes(1);
  });

  // A press must not take the caret out of the editor, or the undone text
  // would be restored with nowhere to carry on typing.
  it("keeps the editor's selection when a history button is pressed", () => {
    historyState.canUndo = true;
    const { getByTitle } = renderChrome();
    const stolen = fireEvent.mouseDown(getByTitle("Undo"));
    // fireEvent returns false when a listener called preventDefault.
    expect(stolen).toBe(false);
    // The sidebar toggle is ordinary: it may take focus like any button.
    expect(fireEvent.mouseDown(getByTitle("Note actions"))).toBe(true);
  });

  // ─── Placement ────────────────────────────────────────────────────
  // With the sidebar away, the left group is pinned to the top-left of the
  // viewport, over the editor rather than over the (zero-width) sidebar column.
  // The same group serves a closed overlay at narrow widths.
  it("pins the left group to the viewport corner when the sidebar is away", () => {
    layoutState.sidebarVisible = false;
    layoutState.sidebarInFlow = false;
    const { container } = renderChrome();
    const group = container.firstChild;
    expect(group.style.position).toBe("fixed");
    expect(group.style.left).toBe("10px");
  });

  // Expanded, the group belongs to the editor and starts at its left edge: the
  // sidebar's width plus its drag handle, then the chrome inset.
  it("starts the left group at the editor's left edge while the sidebar is in flow", () => {
    layoutState.sidebarVisible = true;
    layoutState.sidebarInFlow = true;
    layoutState.sidebarWidth = 260;
    const { container } = renderChrome();
    expect(container.firstChild.style.left).toBe("274px");
  });
});
