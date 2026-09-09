/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
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
  const setWikilinkMenu = vi.fn();
  const commitNoteData = vi.fn();
  const deps = {
    noteData,
    noteDataRef: { current: noteData },
    textOnlyEdit: { current: false },
    openNote,
    createNote,
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
  it("builds the title set (lowercased)", () => {
    const { result } = setup();
    expect(result.current.noteTitleSet.has("alpha")).toBe(true);
    expect(result.current.noteTitleSet.has("beta")).toBe(true);
    // The backlink index left with the panel (2026-09-05).
    expect(result.current).not.toHaveProperty("currentBacklinks");
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

  it("select inserts the link with a bump, leaves the DOM to the block's own repaint, and queues the caret", () => {
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

    // The block paints itself from the ref on the bump; the handler writes
    // nothing to the DOM. The caret is queued after the link.
    expect(el.innerHTML).toBe("");
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
