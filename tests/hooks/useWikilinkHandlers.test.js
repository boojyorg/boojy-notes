/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (text) => `RENDERED:${text}`,
}));

import { useWikilinkHandlers } from "../../src/hooks/useWikilinkHandlers";

function setup(overrides = {}) {
  const noteData = {
    n1: { title: "Alpha", content: { blocks: [{ id: "b1", text: "see [[Be" }] } },
    n2: { title: "Beta", content: { blocks: [] } },
  };
  const openNote = vi.fn();
  const createNote = vi.fn();
  const getOtherPaneId = vi.fn(() => "pane-2");
  const openNoteInPane = vi.fn();
  const splitPaneWithNote = vi.fn();
  const setWikilinkMenu = vi.fn();
  const commitNoteData = vi.fn();
  const deps = {
    noteData,
    noteDataRef: { current: noteData },
    activeNote: "n1",
    note: noteData.n1,
    textOnlyEdit: { current: false },
    openNote,
    createNote,
    splitState: { splitMode: false },
    getOtherPaneId,
    openNoteInPane,
    splitPaneWithNote,
    wikilinkMenuRef: { current: { noteId: "n1", blockIndex: 0 } },
    setWikilinkMenu,
    syncGeneration: { current: 0 },
    commitNoteData,
    blockRefs: { current: {} },
    focusBlockId: { current: null },
    focusCursorPos: { current: null },
    ...overrides,
  };
  const { result, rerender } = renderHook((p) => useWikilinkHandlers(p), { initialProps: deps });
  return { ...deps, result, rerender };
}

describe("useWikilinkHandlers", () => {
  it("builds the title set (lowercased) and the current note's backlinks", () => {
    const { result } = setup();
    expect(result.current.noteTitleSet.has("alpha")).toBe(true);
    expect(result.current.noteTitleSet.has("beta")).toBe(true);
    // n1 "Alpha" is referenced by n1's own block "[[Be" — no full link to Alpha, so none
    expect(Array.isArray(result.current.currentBacklinks)).toBe(true);
  });

  it("click opens an existing note by title (case-insensitive)", () => {
    const { result, openNote, createNote } = setup();
    result.current.handleWikilinkClick("beta");
    expect(openNote).toHaveBeenCalledWith("n2");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("click creates a note when the title doesn't exist", () => {
    const { result, openNote, createNote } = setup();
    result.current.handleWikilinkClick("Gamma");
    expect(createNote).toHaveBeenCalledWith(null, "Gamma");
    expect(openNote).not.toHaveBeenCalled();
  });

  it("cmd-click splits with the note when not already split", () => {
    const { result, splitPaneWithNote } = setup();
    result.current.handleWikilinkCmdClick("Beta");
    expect(splitPaneWithNote).toHaveBeenCalledWith("vertical", "n2");
  });

  it("cmd-click opens in the other pane when already in split mode", () => {
    const { result, openNoteInPane } = setup({ splitState: { splitMode: true } });
    result.current.handleWikilinkCmdClick("Beta");
    expect(openNoteInPane).toHaveBeenCalledWith("n2", "pane-2");
  });

  it("select inserts the link, writes rendered HTML to the DOM, and queues the caret", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const noteData = {
      n1: { title: "Alpha", content: { blocks: [{ id: "b1", text: "see [[Be" }] } },
    };
    const {
      result,
      commitNoteData,
      syncGeneration,
      focusBlockId,
      focusCursorPos,
      setWikilinkMenu,
    } = setup({
      noteData,
      noteDataRef: { current: noteData },
      blockRefs: { current: { b1: el } },
    });

    result.current.handleWikilinkSelect("Beta");

    // state updated for persistence
    const updater = commitNoteData.mock.calls[0][0];
    const next = updater(noteData);
    expect(next.n1.content.blocks[0].text).toBe("see [[Beta]]");
    expect(syncGeneration.current).toBe(1);

    // DOM written directly (native-listener path) + caret queued
    expect(el.innerHTML).toBe("RENDERED:see [[Beta]]");
    expect(focusBlockId.current).toBe("b1");
    expect(focusCursorPos.current).toBe("see [[Beta]]".length);
    expect(setWikilinkMenu).toHaveBeenCalledWith(null);
  });

  it("select is a no-op when there is no menu context", () => {
    const { result, commitNoteData, setWikilinkMenu } = setup({
      wikilinkMenuRef: { current: null },
    });
    result.current.handleWikilinkSelect("Beta");
    expect(commitNoteData).not.toHaveBeenCalled();
    expect(setWikilinkMenu).not.toHaveBeenCalled();
  });
});
