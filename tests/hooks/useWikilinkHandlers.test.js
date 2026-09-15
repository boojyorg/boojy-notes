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
    n3: { title: "Gamma", folder: "Work", content: { blocks: [] } },
  };
  const openNote = vi.fn();
  const createNote = vi.fn();
  const setWikilinkMenu = vi.fn();
  const commitNoteData = vi.fn();
  const showToast = vi.fn();
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
    showToast,
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
    expect(result.current.noteTitleSet.has("gamma")).toBe(true);
    expect(result.current.noteTitleSet.has("work/gamma")).toBe(true);
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
    const { result, openNote, createNote, showToast } = setup();
    result.current.handleWikilinkClick("Delta");
    expect(createNote).toHaveBeenCalledWith(null, "Delta");
    expect(openNote).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  // Obsidian's other target forms name a note too; a click opens that note
  // and never makes a `Beta#Intro` or `Work_Gamma` file (2026-09-15).
  it("click on a heading, block or folder-path link opens the note it names", () => {
    const { result, openNote, createNote } = setup();
    result.current.handleWikilinkClick("Beta#Intro");
    result.current.handleWikilinkClick("Beta#^ref");
    result.current.handleWikilinkClick("Work/Gamma");
    result.current.handleWikilinkClick("Work/Gamma.md#Plan");
    expect(openNote.mock.calls).toEqual([["n2"], ["n2"], ["n3"], ["n3"]]);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("click on an unsupported target whose note is missing creates nothing and says so", () => {
    const { result, openNote, createNote, showToast } = setup();
    result.current.handleWikilinkClick("Delta#Intro");
    result.current.handleWikilinkClick("Work/Delta");
    // Beta exists, but the path says Old: a stale path opens no namesake.
    result.current.handleWikilinkClick("Old/Beta");
    result.current.handleWikilinkClick("#Intro");
    expect(createNote).not.toHaveBeenCalled();
    expect(openNote).not.toHaveBeenCalled();
    expect(showToast.mock.calls.map(([msg, type]) => [msg.split(".")[0], type])).toEqual([
      ['No note named "Delta"', "info"],
      ['No note named "Delta" in Work', "info"],
      ['No note named "Beta" in Old', "info"],
      ["Links to a heading in this note can't be followed yet", "info"],
    ]);
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
