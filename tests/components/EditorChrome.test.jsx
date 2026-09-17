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
    const { container, queryByLabelText, getByLabelText } = renderChrome();
    expect(container.querySelectorAll("button").length).toBe(3);
    expect(getByLabelText("Undo")).toBeInTheDocument();
    expect(getByLabelText("Redo")).toBeInTheDocument();
    expect(getByLabelText("Note actions")).toBeInTheDocument();
    for (const gone of ["Toggle sidebar", "Search notes", "New note"]) {
      expect(queryByLabelText(gone)).not.toBeInTheDocument();
    }
  });

  it("adds the sidebar, search and new-note controls when the sidebar is not showing", () => {
    layoutState.sidebarVisible = false;
    const { getByLabelText } = renderChrome();
    for (const shown of ["Toggle sidebar", "Search notes", "New note", "Undo", "Redo"]) {
      expect(getByLabelText(shown)).toBeInTheDocument();
    }
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

  // ─── History ──────────────────────────────────────────────────────
  it("disables undo and redo until the open note has something to take back", () => {
    const { getByLabelText } = renderChrome();
    expect(getByLabelText("Undo")).toHaveAttribute("aria-disabled", "true");
    expect(getByLabelText("Redo")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(getByLabelText("Undo"));
    expect(historyState.undo).not.toHaveBeenCalled();
  });

  it("calls the history actions when the open note has them", () => {
    historyState.canUndo = true;
    historyState.canRedo = true;
    const { getByLabelText } = renderChrome();
    expect(getByLabelText("Undo")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(getByLabelText("Undo"));
    fireEvent.click(getByLabelText("Redo"));
    expect(historyState.undo).toHaveBeenCalledTimes(1);
    expect(historyState.redo).toHaveBeenCalledTimes(1);
  });

  // A press must not take the caret out of the editor, or the undone text
  // would be restored with nowhere to carry on typing.
  it("keeps the editor's selection when a history button is pressed", () => {
    historyState.canUndo = true;
    const { getByLabelText } = renderChrome();
    const stolen = fireEvent.mouseDown(getByLabelText("Undo"));
    // fireEvent returns false when a listener called preventDefault.
    expect(stolen).toBe(false);
    // The sidebar toggle is ordinary: it may take focus like any button.
    expect(fireEvent.mouseDown(getByLabelText("Note actions"))).toBe(true);
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

  // Collapsed, the trio holds the corner and the history pair sits one
  // group-gap past it, as its own fixed block so it can slide on the panel's
  // clock (2026-09-14): 10 + three 32px buttons with two 2px gaps + 12.
  it("places the history pair past the trio, in its own block, when collapsed", () => {
    layoutState.sidebarVisible = false;
    const { getByLabelText } = renderChrome();
    const pair = getByLabelText("Undo").parentElement;
    const trio = getByLabelText("Toggle sidebar").parentElement.parentElement;
    expect(pair).not.toBe(trio);
    expect(pair.style.position).toBe("fixed");
    expect(pair.style.left).toBe("122px");
    expect(pair.style.transition).toContain("left");
    // The trio arrives after the panel has gone, never over it.
    expect(trio.style.animation).toContain("fadeIn");
  });

  // Expanded, the pair belongs to the editor and starts at its left edge: the
  // sidebar's width plus its drag handle, then the chrome inset.
  it("starts the left group at the editor's left edge while the sidebar shows", () => {
    layoutState.sidebarVisible = true;
    layoutState.sidebarWidth = 260;
    const { container } = renderChrome();
    expect(container.firstChild.style.left).toBe("274px");
  });
});
